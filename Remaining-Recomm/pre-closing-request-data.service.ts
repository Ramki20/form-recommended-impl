import { Injectable } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  of,
  forkJoin,
  from,
  firstValueFrom,
} from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';
import { UserLoanDataService } from '../userLoanData/userLoanData.service';
import { LoanInfoService } from '../loanInfo/loanInfo.service';
import { SetAsideRequestService } from '../setAsideRequest/setAsideRequest.service';
import { UserService } from 'src/app/services/login/user.service';
import { SessionService } from 'src/app/services/session/session.service';
import { DirectLoan } from '../../interfaces/loanData.interface';
import {
  SetAsideFormData,
  SetAsideInput,
  SetAsideOutcomeResponse,
  SetAsideRequestData2,
  SetAsideRequestOutcomeData2,
  SetAsideProcessingResult,
} from '../../interfaces/pre-close.model';
import { LoggerService } from 'src/app/services/logger/logger.service';
import { CustomerInfoService } from 'projects/underwriting/src/app/services/customerInfo/customer-info.service';
import { RequestService } from '../request/request.service';
import { CustomerProfileService } from '../customerProfile/customer-profile.service';

@Injectable({
  providedIn: 'root',
})
export class PreClosingRequestDataService {
  private logger = this.loggerService.forComponent(
    PreClosingRequestDataService
  );
  private eligibleLoansSubject = new BehaviorSubject<DirectLoan[]>([]);
  eligibleLoans$ = this.eligibleLoansSubject.asObservable();

  private setAsideInputsSubject = new BehaviorSubject<
    { loanId: number; setAsideInput: SetAsideInput }[]
  >([]);
  setAsideInputs$ = this.setAsideInputsSubject.asObservable();

  private setAsideRequestsSubject = new BehaviorSubject<
    { loanId: number; setAsideRequest: SetAsideRequestData2 | null }[]
  >([]);
  setAsideRequests$ = this.setAsideRequestsSubject.asObservable();

  private setAsideOutcomesSubject = new BehaviorSubject<
    { loanId: number; setAsideOutcome: SetAsideRequestOutcomeData2 | null }[]
  >([]);
  setAsideOutcomes$ = this.setAsideOutcomesSubject.asObservable();

  private selectedLoanSubject = new BehaviorSubject<DirectLoan | null>(null);
  selectedLoan$ = this.selectedLoanSubject.asObservable();

  private setAsideFormDataSubject = new BehaviorSubject<
    { loanId: number; formData: SetAsideFormData }[]
  >([]);
  setAsideFormData$ = this.setAsideFormDataSubject.asObservable();
  
  // RECOMMENDATION 1 & 2: Make requestIdSubject public for component access
  public requestIdSubject = new BehaviorSubject<number | null>(null);
  requestId$ = this.requestIdSubject.asObservable();
  
  preClosingData$ = combineLatest([
    this.eligibleLoans$,
    this.setAsideInputs$,
    this.setAsideRequests$,
    this.setAsideOutcomes$,
    this.requestId$,
  ]).pipe(
    map(
      ([
        loans,
        setAsideInputs,
        setAsideRequests,
        setAsideOutcomes,
        requestId,
      ]) =>
        loans.map((loan) => ({
          loan,
          setAsideInput:
            setAsideInputs.find((item) => item.loanId === loan.id)
              ?.setAsideInput || null,
          setAsideRequest:
            setAsideRequests.find((item) => item.loanId === loan.id)
              ?.setAsideRequest || null,
          setAsideOutcome:
            setAsideOutcomes.find((item) => item.loanId === loan.id)
              ?.setAsideOutcome || null,
          requestId,
        }))
    ),
    tap((data) => {
      this.logger.info('preClosingData$ emitted', data);
    })
  );

  selectedSetAsideData$ = combineLatest([
    this.selectedLoan$,
    this.setAsideInputs$,
    this.setAsideFormData$,
  ]).pipe(
    map(([loan, setAsideInputs, setAsideFormData]) => ({
      loan,
      setAsideInput: loan
        ? setAsideInputs.find((item) => item.loanId === loan.id)
            ?.setAsideInput || null
        : null,
      formData: loan
        ? setAsideFormData.find((item) => item.loanId === loan.id)?.formData ||
          null
        : null,
    }))
  );

  constructor(
    private loggerService: LoggerService,
    private userLoanDataService: UserLoanDataService,
    private loanInfoService: LoanInfoService,
    private setAsideRequestService: SetAsideRequestService,
    private userService: UserService,
    private sessionService: SessionService,
    private requestService: RequestService,
    private customerInfoService: CustomerInfoService,
    private customerProfileService: CustomerProfileService
  ) {
    this.eligibleLoans$.subscribe((loans) => {
      this.logger.info('eligibleLoans$ emitted', loans);
    });
    this.selectedLoan$.subscribe((loan) => {
      this.logger.info('selectedLoan$ emitted', loan);
      if (loan) {
        const existingInput = this.setAsideInputsSubject
          .getValue()
          .find((item) => item.loanId === loan.id);
        if (!existingInput) {
          this.fetchSetAsideInput(loan.id);
        }
        const existingRequest = this.setAsideRequestsSubject
          .getValue()
          .find((item) => item.loanId === loan.id);
        const existingOutcome = this.setAsideOutcomesSubject
          .getValue()
          .find((item) => item.loanId === loan.id);
        if (!existingRequest || !existingOutcome) {
          this.fetchSetAsideOutcome(loan.id);
        }
      }
    });
    this.fetchRequestId();
    this.requestId$.subscribe((requestId) => {
      this.userLoanDataService.setRequestID(requestId);
      this.logger.info('requestId updated in UserLoanDataService:', requestId);
    });
  }

  private updateSubject<T>(
    subject: BehaviorSubject<{ loanId: number; [key: string]: any }[]>,
    loanId: number,
    newItem: T
  ): void {
    const current = subject.getValue().filter((item) => item.loanId !== loanId);
    subject.next([...current, { loanId, ...newItem }]);
  }

  fetchEligibleLoans(ccId: string) {
    this.fetchRequestId();
    this.userLoanDataService
      .getDirectLoanInfo(ccId, 'O')
      .pipe(
        map((response) =>
          response.data.filter((loan) => loan.loanRelationshipTypeCode === 'PR')
        ),
        switchMap((directLoanList) => {
          const currentDate = new Date();
          const cutoffDate = new Date(2024, 8, 25);
          const eligibleLoans: DirectLoan[] = [];
          const setAsideInputs: {
            loanId: number;
            setAsideInput: SetAsideInput;
          }[] = [];

          return forkJoin(
            directLoanList.map((directLoan, index) =>
              this.loanInfoService
                .getSetAsideInputForLoan(
                  directLoan.id,
                  this.formatDate(currentDate),
                  index + 1
                )
                .pipe(
                  map((innerResponse) => {
                    const setAsideInputForLoan = innerResponse.data;
                    if (
                      new Date(setAsideInputForLoan.originalLoanClosedDate) >=
                      cutoffDate
                    ) {
                      return null;
                    }

                    let previousInstallment = new Date(
                      setAsideInputForLoan.nextInstallmentDueDate
                    );
                    previousInstallment.setFullYear(currentDate.getFullYear());
                    if (previousInstallment > currentDate) {
                      previousInstallment.setFullYear(
                        previousInstallment.getFullYear() - 1
                      );
                    }
                    previousInstallment.setFullYear(
                      previousInstallment.getFullYear() + 2
                    );
                    const maturityDate = new Date(
                      setAsideInputForLoan.loanMaturityDate
                    );

                    if (previousInstallment <= maturityDate) {
                      eligibleLoans.push(directLoan);
                      const setAsideInput: SetAsideInput = {
                        disasterCode: setAsideInputForLoan.disasterCode,
                        setAsideAmount: setAsideInputForLoan.setAsideAmount,
                        paymentAmountAfterInstallment:
                          setAsideInputForLoan.paymentAmountAfterInstallment,
                        installmentDates:
                          setAsideInputForLoan.installmentDates || [],
                        setAsideType:
                          setAsideInputForLoan.setAsideType || 'DBSA',
                        nextInstallmentDueDate:
                          setAsideInputForLoan.nextInstallmentDueDate,
                        loanMaturityDate: setAsideInputForLoan.loanMaturityDate,
                        loanTotalInterestAmount:
                          setAsideInputForLoan.loanTotalInterestAmount || 0,
                      };
                      return { loanId: directLoan.id, setAsideInput };
                    }
                    return null;
                  }),
                  catchError((error) => {
                    this.logger.info(
                      `Failed to fetch set-aside input for loan ${directLoan.id}`,
                      error
                    );
                    return of(null);
                  })
                )
            )
          ).pipe(
            switchMap((results) => {
              const validInputs = results.filter(
                (result) => result !== null
              ) as {
                loanId: number;
                setAsideInput: SetAsideInput;
              }[];
              setAsideInputs.push(...validInputs);
              eligibleLoans.sort(
                (a, b) =>
                  a.loanNumber
                    ?.toString()
                    .localeCompare(b.loanNumber?.toString() || '') || 0
              );

              if (eligibleLoans.length === 0) {
                return of({
                  loans: eligibleLoans,
                  inputs: setAsideInputs,
                  requests: [],
                  outcomes: [],
                });
              }

              return this.fetchSetAsideOutcomes(
                eligibleLoans.map((loan) => loan.id)
              ).pipe(
                map((results) => ({
                  loans: eligibleLoans,
                  inputs: setAsideInputs,
                  requests: results.map((result) => ({
                    loanId: result.loanId,
                    setAsideRequest: result.request,
                  })),
                  outcomes: results.map((result) => ({
                    loanId: result.loanId,
                    setAsideOutcome: result.outcome,
                  })),
                }))
              );
            }),
            tap(({ loans, inputs, requests, outcomes }) => {
              this.eligibleLoansSubject.next([...loans]);
              this.setAsideInputsSubject.next(inputs);
              this.setAsideRequestsSubject.next(requests);
              this.setAsideOutcomesSubject.next(outcomes);
            }),
            map(({ loans }) => loans),
            catchError((error) => {
              this.logger.info('Failed to fetch eligible loans', error);
              this.eligibleLoansSubject.next([]);
              this.setAsideInputsSubject.next([]);
              this.setAsideRequestsSubject.next([]);
              this.setAsideOutcomesSubject.next([]);
              return of([]);
            })
          );
        })
      )
      .subscribe();
  }

  private fetchSetAsideOutcomes(loanIds: number[]): Observable<
    {
      loanId: number;
      request: SetAsideRequestData2 | null;
      outcome: SetAsideRequestOutcomeData2 | null;
    }[]
  > {
    return forkJoin(
      loanIds.map((loanId) =>
        this.setAsideRequestService.getSetAsideOutcome(this.userLoanDataService.getRequestID(), loanId).pipe(
          map((response: SetAsideOutcomeResponse) => ({
            loanId,
            request: response?.setAsideRequest?.requestData ?? null,
            outcome: response?.setAsideRequest?.outcomeData ?? null,
          })),
          catchError((error) => {
            this.logger.info(
              `Failed to fetch set-aside outcome for loan ${loanId}`,
              error
            );
            return of({ loanId, request: null, outcome: null });
          })
        )
      )
    );
  }

  private formatDate(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }

  private fetchSetAsideInput(loanId: number) {
    const accrualDate = this.formatDate(new Date());
    this.loanInfoService
      .getSetAsideInputForLoan(loanId, accrualDate, 1)
      .subscribe((response) => {
        const setAsideInput: SetAsideInput = {
          disasterCode: response.data.disasterCode,
          setAsideAmount: response.data.setAsideAmount,
          paymentAmountAfterInstallment:
            response.data.paymentAmountAfterInstallment,
          installmentDates: response.data.installmentDates || [],
          setAsideType: response.data.setAsideType || 'DSA',
          nextInstallmentDueDate: response.data.nextInstallmentDueDate,
          loanMaturityDate: response.data.loanMaturityDate,
          loanTotalInterestAmount: response.data.loanTotalInterestAmount || 0,
        };
        this.updateSubject(this.setAsideInputsSubject, loanId, {
          setAsideInput,
        });
      });
  }

  private fetchSetAsideOutcome(loanId: number): void {
    this.logger.info(`Fetching set-aside outcome for loanId: ${loanId}`);
    this.setAsideRequestService.getSetAsideOutcome(this.userLoanDataService.getRequestID(), loanId).subscribe({
      next: (response: SetAsideOutcomeResponse) => {
        const request = response?.setAsideRequest?.requestData ?? null;
        const outcome = response?.setAsideRequest?.outcomeData ?? null;
        this.logger.info(
          `Updating setAsideRequests for loanId: ${loanId}`,
          request
        );
        this.updateSubject(this.setAsideRequestsSubject, loanId, {
          setAsideRequest: request,
        });
        this.updateSubject(this.setAsideOutcomesSubject, loanId, {
          setAsideOutcome: outcome,
        });
      },
      error: (error) => {
        this.logger.info(
          `Failed to fetch set-aside outcome for loan ${loanId}`,
          error
        );
        this.updateSubject(this.setAsideRequestsSubject, loanId, {
          setAsideRequest: null,
        });
        this.updateSubject(this.setAsideOutcomesSubject, loanId, {
          setAsideOutcome: null,
        });
      },
    });
  }

  selectLoan(loan: DirectLoan | null) {
    if (loan) {
      const currentLoan = this.selectedLoanSubject.getValue();
      if (currentLoan?.id === loan.id) {
        this.selectedLoanSubject.next(loan);
        return;
      }
      const setAsideRequest = this.setAsideRequestsSubject
        .getValue()
        .find((item) => item.loanId === loan.id)?.setAsideRequest;
      if (setAsideRequest) {
        this.logger.info(
          `Loan ${loan.id} has an existing set-aside request and cannot be selected.`
        );
        return;
      }
    }
    this.selectedLoanSubject.next(loan);
  }

  clearSelectedLoan() {
    this.selectLoan(null);
    this.setAsideFormDataSubject.next([]);
  }

  updateSetAsideFormData(loanId: number, formData: SetAsideFormData) {
    this.updateSubject(this.setAsideFormDataSubject, loanId, { formData });
  }

  // RECOMMENDATION 1: Modified to return async processing result
  async saveSetAsideInfo(formData: SetAsideFormData): Promise<SetAsideProcessingResult> {
    const loan = this.selectedLoanSubject.getValue();
    if (!loan) {
      return {
        success: false,
        error: 'No loan selected'
      };
    }

    try {
      const requestId = this.requestIdSubject.getValue();
      if (!requestId || isNaN(requestId)) {
        return {
          success: false,
          error: 'No valid request ID available'
        };
      }

      const ccid = this.sessionService.getCoreCustomerIdentifier();
      const customers = await firstValueFrom(
        this.customerProfileService.getCustomerDetails(ccid)
      );
      const customer = customers?.[0];
      if (!customer) {
        return {
          success: false,
          error: 'No customer details found for the provided identifier'
        };
      }

      this.updateSetAsideFormData(loan.id, formData);
      const requestData = await this.createSetAsideRequestData(formData, loan, customer);

      this.logger.info('Starting async set-aside request processing', requestData);
      
      // RECOMMENDATION 1: Call the new async service method
      const result = await this.setAsideRequestService.saveSetAsideRequest2(requestData);
      
      if (result.success) {
        this.logger.info('Set-aside processing started successfully', result);
        
        // Update the request data optimistically (will be verified when processing completes)
        // Don't clear selected loan yet - let user see the processing status
        
        return {
          success: true,
          executionArn: result.executionArn,
          trackingKey: result.trackingKey,
          message: result.message,
          requestId: requestId
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to start processing'
        };
      }
      
    } catch (error: any) {
      this.logger.error('Error starting set-aside processing', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred'
      };
    }
  }

  private async createSetAsideRequestData(
    formData: SetAsideFormData,
    loan: DirectLoan,
    customer: any
  ): Promise<SetAsideRequestData2> {
    const userInfo = this.userService.getUserInfoFromSession();
    const ddcInput =
      formData.setAsideType === 'DSA' ? formData.disasterCode : 'Z2024';

    const dateArray = formData.installmentDate.split('/');
    const installmentDate = new Date(
      parseInt(dateArray[2]),
      parseInt(dateArray[0]) - 1,
      parseInt(dateArray[1])
    );

    const effectiveDate = this.getEarlierDate(
      new Date(formData.approvalDate),
      installmentDate
    );

    const requestId = this.requestIdSubject.getValue();
    if (!requestId || isNaN(requestId)) {
      throw new Error('No valid request ID available');
    }

    const setAsideAmount =
      typeof formData.setAsideAmount === 'number'
        ? formData.setAsideAmount
        : parseFloat(formData.setAsideAmount);
    const paymentAfterInstallment =
      formData.paymentAfterInstallment === null ||
      formData.paymentAfterInstallment === undefined
        ? 0
        : typeof formData.paymentAfterInstallment === 'number'
        ? formData.paymentAfterInstallment
        : parseFloat(formData.paymentAfterInstallment);

    if (isNaN(setAsideAmount) || isNaN(paymentAfterInstallment)) {
      throw new Error(
        'Invalid numeric values for set-aside amount or payment after installment'
      );
    }

    const requestData: SetAsideRequestData2 = {
      rqst_id: requestId,
      loan_id: loan.id,
      task_id: 1,
      addm_dt: new Date(formData.approvalDate),
      dstr_dsgt_cd: ddcInput,
      eff_dt: effectiveDate,
      istl_dt: installmentDate,
      istl_set_asd_amt: setAsideAmount,
      istl_paid_amt: paymentAfterInstallment,
      eauth_id: userInfo?.eAuthID || 'user',
      set_asd_type_cd: formData.setAsideType,
      flpCustomerId: Number(this.sessionService.getFlpCustomerId()),
      caseNumber: customer.caseNumber,
      fundCode: loan.fundCode,
      lastCashCreditDate: loan.lastCashCreditDate,
      loanAmount: loan.loanAmount,
      loanClosingDate: loan.loanClosingDate,
      loanExpirationDate: loan.loanExpirationDate,
      loanNumber: loan.loanNumber,
      loanRelationshipTypeCode: loan.loanRelationshipTypeCode,
      loanType: loan.loanType,
      loanWriteOffDescription: loan.loanWriteOffDescription,
      nextInstallmentAmount: loan.nextInstallmentAmount,
      totalLoanScheduledAmount: loan.totalLoanScheduledAmount,
      totalUnpaidInterestAmount: loan.totalUnpaidInterestAmount,
      unpaidPrincipalAmount: loan.unpaidInterestAmount,
      unpaidInterestAmount: loan.unpaidInterestAmount
    };

    return requestData;
  }

  private getEarlierDate(addendumDate: Date, installmentDate: Date): Date {
    return addendumDate <= installmentDate ? addendumDate : installmentDate;
  }

  deleteSetAside(loanId: number): Observable<any> {
    return this.preClosingData$.pipe(
      take(1),
      map((data) => data.find((item) => item.loan.id === loanId)),
      switchMap((loanData) => {
        const request = loanData?.setAsideRequest;
        this.logger.info(`Delete set-aside for loanId: ${loanId}`, request);

        if (!request || !request.set_asd_rqst_id) {
          this.logger.info(
            `No active set-aside request found for loanId: ${loanId}`
          );
          return of({
            success: false,
            message: 'No set-aside request to delete',
          });
        }

        return this.setAsideRequestService
          .deleteSetAsideRequest(request.set_asd_rqst_id)
          .pipe(
            tap(() => {
              this.setAsideInputsSubject.next(
                this.setAsideInputsSubject
                  .getValue()
                  .filter((item) => item.loanId !== loanId)
              );
              this.setAsideFormDataSubject.next(
                this.setAsideFormDataSubject
                  .getValue()
                  .filter((item) => item.loanId !== loanId)
              );
              this.setAsideRequestsSubject.next(
                this.setAsideRequestsSubject
                  .getValue()
                  .filter((item) => item.loanId !== loanId)
              );
              this.setAsideOutcomesSubject.next(
                this.setAsideOutcomesSubject
                  .getValue()
                  .filter((item) => item.loanId !== loanId)
              );
              this.logger.info(`Cleared local state for loanId: ${loanId}`);
            }),
            map((response) => ({ success: true, response })),
            catchError((error) => {
              this.logger.info(
                `Failed to delete set-aside for loanId: ${loanId}`,
                error
              );
              return of({
                success: false,
                error: new Error('Error in deleteSetAside.'),
              });
            })
          );
      })
    );
  }

  private fetchRequestId() {
    this.requestIdSubject.next(this.userLoanDataService.getRequestID());
  }
}