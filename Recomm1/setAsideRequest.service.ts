import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, from, map, Observable, interval, switchMap, takeWhile, BehaviorSubject } from 'rxjs';
import {
  ProcessSetAsideForLoanData,
  ProcessSetAsideForLoanRequest,
  SaveSetAsideConfirmationRequest,
  SaveSetAsideConfirmationRequestResponse,
} from 'src/app/models/set-aside-processing-model';
import { environment } from 'src/environments/environment';
import {
  SetAsideRequestCompleteData,
  SetAsideRequestOutcomeData,
  SetAsideRequestData,
} from '../../interfaces/requestData.interface';
import { HttpRequestService } from '../httpRequest/httpRequest.service';
import {
  SetAsideOutcomeResponse,
  SetAsideRequestCompleteData2,
  SetAsideRequestData2,
  SetAsideRequestOutcomeData2,
  SetAsideProcessingStatus,
  SetAsideProcessingResult
} from '../../interfaces/pre-close.model';

@Injectable({ providedIn: 'root' })
export class SetAsideRequestService {
  processSetAsideForLoanUrl: string;
  saveSetAsideConfirmationUrl: string;
  setAsideTransUrl: string;
  setAsideRequestOutcomeUrl: string;

  // Processing status tracking
  private processingStatusSubject = new BehaviorSubject<Map<string, SetAsideProcessingStatus>>(new Map());
  public processingStatus$ = this.processingStatusSubject.asObservable();

  constructor(
    private httpRequestService: HttpRequestService,
    private http: HttpClient
  ) {
    this.processSetAsideForLoanUrl = `${environment.servicing_url}/processSetAsideForLoan`;
    this.saveSetAsideConfirmationUrl = `${environment.servicing_url}/saveSetAsideConfirmation`;
    this.setAsideTransUrl = `${environment.common_api_url}/setAsideTrans`;
    this.setAsideRequestOutcomeUrl = `${environment.servicing_url}/setAsideRequestOutcome`
  }

  /**
   * Create a new set aside request record to the backend server using set_asd schema.
   * Now returns immediately with processing status and starts monitoring.
   */
  async saveSetAsideRequest2(requestData: SetAsideRequestData2): Promise<SetAsideProcessingResult> {
    const route = 'setAsideRequestParent';
    const trackingKey = `${requestData.rqst_id}-${requestData.loan_id}`;
    
    try {
      console.log('Sending setAsideRequestData: ', JSON.stringify(requestData, null, 2));
      
      // Start processing
      const response = await this.httpRequestService.post(route, requestData);
      console.log('Async processing started: ', JSON.stringify(response, null, 2));
      
      if (response.executionArn) {
        // Update processing status
        this.updateProcessingStatus(trackingKey, {
          status: 'PROCESSING',
          message: 'FSA-2501 form generation started...',
          executionArn: response.executionArn,
          startTime: new Date().toISOString(),
          requestId: response.requestId,
          loanId: response.loanId
        });

        // Start monitoring the execution
        this.startStatusMonitoring(response.executionArn, trackingKey);

        return {
          success: true,
          executionArn: response.executionArn,
          trackingKey: trackingKey,
          message: 'Processing started successfully'
        };
      } else {
        throw new Error('No execution ARN returned from server');
      }
    } catch (error) {
      console.error('Error starting set-aside request processing:', error);
      
      // Update status with error
      this.updateProcessingStatus(trackingKey, {
        status: 'FAILED',
        message: 'Failed to start processing',
        error: error.message || 'Unknown error occurred'
      });

      return {
        success: false,
        error: error.message || 'Failed to start processing'
      };
    }
  }

  /**
   * Start monitoring the status of an async execution
   */
  private startStatusMonitoring(executionArn: string, trackingKey: string): void {
    // Poll every 3 seconds, stop when completed or failed
    interval(3000).pipe(
      switchMap(() => this.checkExecutionStatus(executionArn)),
      takeWhile(status => 
        status.status === 'RUNNING' || 
        status.status === 'PROCESSING', 
        true // Include the final emission
      )
    ).subscribe({
      next: (statusResponse) => {
        console.log(`Status update for ${trackingKey}:`, statusResponse);
        this.updateProcessingStatus(trackingKey, {
          status: this.mapExecutionStatus(statusResponse.status),
          message: this.getStatusMessage(statusResponse.status),
          executionArn: statusResponse.executionArn,
          result: statusResponse.result,
          error: statusResponse.error,
          lastUpdated: new Date().toISOString()
        });
      },
      error: (error) => {
        console.error(`Error monitoring status for ${trackingKey}:`, error);
        this.updateProcessingStatus(trackingKey, {
          status: 'FAILED',
          message: 'Failed to monitor processing status',
          error: error.message || 'Status monitoring failed'
        });
      }
    });
  }

  /**
   * Check the status of a Step Function execution
   */
  private checkExecutionStatus(executionArn: string): Observable<any> {
    const encodedArn = encodeURIComponent(executionArn);
    const route = `getSetAsideStatus/${encodedArn}`;
    
    return from(this.httpRequestService.get(route)).pipe(
      catchError(error => {
        console.error('Failed to check execution status:', error);
        throw error;
      })
    );
  }

  /**
   * Map Step Function status to our internal status
   */
  private mapExecutionStatus(sfnStatus: string): 'PROCESSING' | 'COMPLETED' | 'FAILED' {
    switch (sfnStatus) {
      case 'RUNNING':
        return 'PROCESSING';
      case 'SUCCEEDED':
        return 'COMPLETED';
      case 'FAILED':
      case 'TIMED_OUT':
      case 'ABORTED':
        return 'FAILED';
      default:
        return 'PROCESSING';
    }
  }

  /**
   * Get user-friendly status message
   */
  private getStatusMessage(sfnStatus: string): string {
    switch (sfnStatus) {
      case 'RUNNING':
        return 'Generating FSA-2501 form and processing documents...';
      case 'SUCCEEDED':
        return 'FSA-2501 form generated successfully and saved to your documents.';
      case 'FAILED':
        return 'Failed to generate FSA-2501 form. Please try again.';
      case 'TIMED_OUT':
        return 'Processing timed out. Please try again.';
      case 'ABORTED':
        return 'Processing was cancelled.';
      default:
        return 'Processing...';
    }
  }

  /**
   * Update processing status for a specific tracking key
   */
  private updateProcessingStatus(trackingKey: string, status: SetAsideProcessingStatus): void {
    const currentMap = this.processingStatusSubject.value;
    const newMap = new Map(currentMap);
    newMap.set(trackingKey, status);
    this.processingStatusSubject.next(newMap);
  }

  /**
   * Get processing status for a specific request
   */
  getProcessingStatus(requestId: number, loanId: number): Observable<SetAsideProcessingStatus | null> {
    const trackingKey = `${requestId}-${loanId}`;
    return this.processingStatus$.pipe(
      map(statusMap => statusMap.get(trackingKey) || null)
    );
  }

  /**
   * Clear processing status for a specific request
   */
  clearProcessingStatus(requestId: number, loanId: number): void {
    const trackingKey = `${requestId}-${loanId}`;
    const currentMap = this.processingStatusSubject.value;
    const newMap = new Map(currentMap);
    newMap.delete(trackingKey);
    this.processingStatusSubject.next(newMap);
  }

  // ... rest of the existing methods remain unchanged ...

  /**
   * create a new set Aside request record to the backend server.
   *
   * @param {SetAsideRequestData} requestData - The data to be saved for the service request.
   * @returns {Promise<any>} - A Promise that resolves to the server's response or null on error.
   */
  async saveSetAsideRequest(requestData: SetAsideRequestCompleteData) {
    console.log(
      'SetAsideRequestData before saving in DB ************',
      requestData
    );
    const route = 'setAsideRequest';
    const routeOtcm = 'setAsideRequestOutcome';
    let setAsideRequestResponse: any;
    let setAsideOutcomeResponse: any;
    try {
      setAsideRequestResponse = await this.httpRequestService.post(
        route,
        requestData.setAsideRequestData
      );
      console.log(
        'SetAsideRequestResponse after saving in DB ************',
        setAsideRequestResponse
      );
    } catch (error) {
      console.error('Error saving SetAsideRequestData in service:', error);
      return null;
    }

    try {
      requestData.setAsideRequestOutcomeData.rqst_loan_id =
        setAsideRequestResponse.setAsideRequestData.rqst_loan_id;

      this.prepareSetAsideRequestOutcomeData(requestData);

      console.log(
        'setAsideRequestOutComeResponse Before saving in DB ************',
        requestData.setAsideRequestOutcomeData
      );
      // call to lambda
      setAsideOutcomeResponse = await this.httpRequestService.post(
        routeOtcm,
        requestData.setAsideRequestOutcomeData
      );
      console.log(
        'setAsideRequestOutComeResponse after saving in DB ************',
        setAsideOutcomeResponse
      );
    } catch (error) {
      console.error(
        'Error saving setAsideRequestOutComeResponse in service:',
        error
      );
    }
    let combinedSetAsideResponse = {
      setAsideRequestResponse: setAsideRequestResponse,
      setAsideOutcomeResponse: setAsideOutcomeResponse,
    };
    return combinedSetAsideResponse;
  }

  prepareSetAsideRequestOutcomeData(
    requestData: SetAsideRequestCompleteData
  ) {
    let setAsideAmount = requestData.setAsideRequestData.istl_set_asd_amt;
    console.log('setAsideAmount: before', setAsideAmount);
    setAsideAmount = parseFloat(setAsideAmount.toString().replace(/,/g, ''));
    console.log('setAsideAmount: After', setAsideAmount);

    let installmentSetAsideAmount = setAsideAmount;
    let nonCapitalizedInterestInstallment =
      requestData.setAsideRequestOutcomeData.non_cptl_int_istl_amt;
    let deferredNonCapitalizedInterestInstallment =
      requestData.setAsideRequestOutcomeData.dfr_non_cptl_int_istl_amt;
    let deferredInterestInstallment =
      requestData.setAsideRequestOutcomeData.dfr_int_istl_amt;
    let accruedInterestAmount =
      requestData.setAsideRequestOutcomeData.acru_int_amt;

    // Output values
    let nonCapitalizedInterestAmount: number = 0;
    let deferredNonCapitalizedInterestAmount: number = 0;
    let deferredInterestAmount: number = 0;
    let setAsideInterestAmount: number = 0;

    let setAsidePrincipalAmount: number = 0;

    let remainingAmount = setAsideAmount;
    console.log('installmentSetAsideAmount: 1', installmentSetAsideAmount);
    console.log('remainingAmount: 1', remainingAmount);

    // Step 1: Non-Capitalized Interest Amount
    nonCapitalizedInterestAmount = Math.min(
      remainingAmount,
      nonCapitalizedInterestInstallment
    );
    remainingAmount -= nonCapitalizedInterestAmount;

    console.log('remainingAmount: 2', remainingAmount);
    console.log(
      'nonCapitalizedInterestAmount: 1',
      nonCapitalizedInterestAmount
    );

    // Step 2: Deferred Non-Capitalized Interest Amount
    if (remainingAmount >= deferredNonCapitalizedInterestInstallment) {
      deferredNonCapitalizedInterestAmount =
        deferredNonCapitalizedInterestInstallment;
    } else if (remainingAmount <= 0) {
      deferredNonCapitalizedInterestAmount = 0;
    } else {
      deferredNonCapitalizedInterestAmount = remainingAmount;
    }
    remainingAmount -= deferredNonCapitalizedInterestAmount;

    console.log('remainingAmount: 3', remainingAmount);
    console.log(
      'deferredNonCapitalizedInterestAmount: 1',
      deferredNonCapitalizedInterestAmount
    );

    // Step 3: Deferred Interest Amount
    if (remainingAmount >= deferredInterestInstallment) {
      deferredInterestAmount = deferredInterestInstallment;
    } else if (remainingAmount <= 0) {
      deferredInterestAmount = 0;
    } else {
      deferredInterestAmount = remainingAmount;
    }
    remainingAmount -= deferredInterestAmount;

    console.log('remainingAmount: 4', remainingAmount);
    console.log('deferredInterestAmount: 1', deferredInterestAmount);

    // Step 4: Set-Aside Interest Amount
    if (remainingAmount >= accruedInterestAmount) {
      setAsideInterestAmount = accruedInterestAmount;
    } else if (remainingAmount <= 0) {
      setAsideInterestAmount = 0;
    } else {
      setAsideInterestAmount = remainingAmount;
    }
    remainingAmount -= setAsideInterestAmount;

    console.log('remainingAmount: 5', remainingAmount);
    console.log('setAsideInterestAmount: 1', setAsideInterestAmount);

    // Step 5: Set-Aside Principal Amount
    if (
      installmentSetAsideAmount <=
      nonCapitalizedInterestInstallment +
        deferredNonCapitalizedInterestInstallment +
        deferredInterestInstallment +
        accruedInterestAmount
    ) {
      setAsidePrincipalAmount = 0;
    } else {
      setAsidePrincipalAmount = remainingAmount;
    }

    console.log('installmentSetAsideAmount: 2', installmentSetAsideAmount);
    console.log('remainingAmount: 6', remainingAmount);
    console.log('setAsidePrincipalAmount: 1', setAsidePrincipalAmount);

    console.log('setAsidePrincipalAmount: ', setAsidePrincipalAmount);
    console.log(
      'deferredNonCapitalizedInterestAmount: ',
      deferredNonCapitalizedInterestAmount
    );
    console.log('setAsideInterestAmount: ', setAsideInterestAmount);
    console.log('nonCapitalizedInterestAmount: ', nonCapitalizedInterestAmount);
    console.log('deferredInterestAmount: ', deferredInterestAmount);

    requestData.setAsideRequestOutcomeData.set_asd_prn_amt =
      setAsidePrincipalAmount;
    requestData.setAsideRequestOutcomeData.set_asd_non_cptl_amt =
      nonCapitalizedInterestAmount;
    requestData.setAsideRequestOutcomeData.set_asd_int_amt =
      setAsideInterestAmount;
    requestData.setAsideRequestOutcomeData.set_asd_dfr_non_cptl_amt =
      deferredNonCapitalizedInterestAmount;
    requestData.setAsideRequestOutcomeData.set_asd_dfr_amt =
      deferredInterestAmount;
  }

  /**
   * CSGWS processSetAsideForLoan call
   * @param coreCustomerIdentifier User's/Customer's CCID
   * @returns CSGWS processSetAsideForLoanResponse
   */
  public processSetAsideForLoan(
    coreCustomerID: number,
    loanID: number,
    userIdentity: string,
    disasterDesignationCode: string,
    effectiveDate: string,
    installmentDate: string,
    installmentSetAsideAmount: number,
    paymentsAfterInstallmentDateAmount: number
  ): Observable<ProcessSetAsideForLoanData> {
    const request: ProcessSetAsideForLoanRequest = {
      coreCustomerID,
      loanID,
      userIdentity,
      disasterDesignationCode,
      effectiveDate,
      installmentDate,
      installmentSetAsideAmount,
      paymentsAfterInstallmentDateAmount,
    };

    const body = JSON.stringify(request);
    return this.http.post<ProcessSetAsideForLoanData>(
      this.processSetAsideForLoanUrl,
      body
    );
  }

  /**
   * save a new set Aside confirmation record to the backend server.
   *
   * @param requestId The Set Aside request's ID
   * @returns {Promise<any>} - A Promise that resolves to the server's response or null on error.
   */
  public saveSetAsideConfirmation(
    requestId: number,
    confirmationNumber: string,
    eAuthId: string
  ): Observable<any> {
    const request: SaveSetAsideConfirmationRequest = {
      requestId,
      confirmationNumber,
      eAuthId,
    };

    const body = JSON.stringify(request);
    return this.http.post<SaveSetAsideConfirmationRequestResponse>(
      this.saveSetAsideConfirmationUrl,
      body
    );
  }

  /**
   * Accessor function to enable testing of prepareSetAsideRequestOutcomeData in test files.
   * @param requestData
   */
  public testPrepareSetAsideRequestOutcomeData(
    requestData: SetAsideRequestCompleteData
  ) {
    this.prepareSetAsideRequestOutcomeData(requestData);
  }

  /**
   * Retrieves the set_asd_rqst data and set_asd_rqst_otcm data associated with the passed in Request Loan ID.
   *
   * Calls the getAllSetAsideData Lambda function.
   *
   * @returns {Observable<SetAsideRequestCompleteData>} An observable of the Set Aside Loan Complete Data object.
   */
  getAllSetAsideData(
    requestLoanId: number
  ): Observable<SetAsideRequestCompleteData> {
    const route = 'getAllSetAsideData/' + requestLoanId;
    return from(
      this.httpRequestService.get<SetAsideRequestCompleteData>(route)
    ).pipe(
      map((response) => {
        const completeDataResponse: SetAsideRequestCompleteData = {
          setAsideRequestData: response.setAsideRequestData[0],
          setAsideRequestOutcomeData: response.setAsideRequestOutcomeData[0],
        };
        return completeDataResponse;
      })
    );
  }

  /**
   * Retrieves the set_asd_rqst data and set_asd_rqst_otcm data associated with the passed in Request Loan ID.
   *
   * Calls the getSetAsideOutcome Lambda function.
   *
   * @returns {Observable<SetAsideRequestCompleteData>} An observable of the Set Aside Loan Complete Data object.
   */
  getSetAsideOutcome(requestId: number, loanId: number): Observable<SetAsideOutcomeResponse> {
    const route = `getSetAsideOutcome/${requestId}/${loanId}`;
    return from(
      this.httpRequestService
        .get<SetAsideOutcomeResponse>(route)
        .then((response) => response)
        .catch((error) => {
          console.error(
            `Failed to fetch set-aside outcome for request ${requestId} and loan ${loanId}:`,
            error
          );
          return { loan_id: loanId, setAsideRequest: null };
        })
    );
  }

  deleteSetAsideRequest(setAsdReqId: number): Observable<any> {
    const route = 'deleteSetAsideRequest';
    const payload = { set_asd_rqst_id: setAsdReqId };
    return from(
      this.httpRequestService
        .post(route, payload)
        .then((response) => {
          console.log('Delete response:', JSON.stringify(response, null, 2));
          return { success: true, response };
        })
        .catch((error) => {
          console.error('Error deleting set-aside request:', error);
          throw error;
        })
    );
  }

  setAsideTrans(taskId: number, loanId: number, confirmationNumber: string, eAuthId: string): Observable<any> {
    const payload = { taskId: taskId, loanId: loanId, confirmationNumber: confirmationNumber, eAuthId: eAuthId };
    const body = JSON.stringify(payload);

    return this.http.post<any>(
      this.setAsideTransUrl,
      body
    );
  }

  setAsideRequestOutcome(data: SetAsideRequestOutcomeData, useSetAsideSchema: boolean): Observable<any> {
    const body = JSON.stringify(data);
    if(useSetAsideSchema) {
      return this.http.post