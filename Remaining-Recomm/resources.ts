export const resources = {
  labels: {
    serviceRequestPage: {
      pageTitle: 'Servicing Requests',
      tab1Title: 'New request',
      tab2Title: 'In progress',
      tab3Title: 'Completed',
      tab4Title: 'Forms',
      createRequestCard: {
        title: 'Create Request',
        titleMessage: 'Changing any field may clear all subsequent fields.',
      },
      eligibleLoansCard: {
        title: 'Eligible Loans',
        col1: 'Fund Code/Loan Number',
        col2: 'Date of Loan',
        col3: 'Unpaid Principal',
        col4: 'Unpaid Interest',
        col5: 'Status',
      },
      loanSummaryCard: {
        title: 'DLS | ',
        row1Title: 'Fund Code/Loan Number',
        row2Title: 'Type',
        row3Title: 'Request Date',
        row4Title: 'Approval Date',
      },
      inProgressRequestsCard: {
        title: 'In progress Requests',
        row1Title1: 'Fund Code/',
        row1Title2: 'Loan Number',
        row2Title: 'Request Type',
        row3Title: 'Received Date',
        row4Title: 'Status',
      },
      completedRequestsCard: {
        title: 'Completed Requests',
        row1Title1: 'Fund Code/',
        row1Title2: 'Loan Number',
        row2Title: 'Request Type',
        row3Title: 'Received Date',
        row4Title: 'Status',
      },
      formRequestsCard: {
        title: 'Forms',
        row1Title1: 'Form Name',
        row1Title2: 'Description',
      },
      errorModal: {
        title: 'Error',
      },
      screenReader: {
        select: 'Select this row',
      },
      buttons: {
        next: 'Next',
        delete: 'Delete',
        add: 'Add',
        continue: 'Continue',
        selectLoan: 'Select loan',
      },
    },

    setAsideRequestPage: {
      error: 'Error',
      setAsideInformation: {
        disasterCode: 'Z2024',
      },
      loanInformationCard: {
        cardTitle: 'Fund Code/Loan Number:',
        row1Title: 'Loan Type',
        row2Title: 'Original Loan Date',
        row3Title: 'Unpaid Principal',
        row4Title: 'Unpaid Interest',
        row5Title: 'Current Note Rate',
      },
      setAsideInformationCard: {
        cardTitle: 'Set-Aside Information',
        row1Title: 'Disaster Code',
        row2Title: 'Addendum Date',
        row3Title: 'Installment Date',
        row4Title: 'Set-Aside Amount',
        row5Title: 'Payment After Installment Date',
      },
      setAsideResultsCard: {
        cardTitle: 'Set-Aside Results',
        row1Title: 'Status',
        row2Title: 'Status Date',
        row3Title: 'Set-Aside Amount',
        row4Title: 'Principal Set-Aside Amount',
        row5Title: 'Interest Set-Aside Amount',
        row6Title: 'Non Capitalized Interest',
        row7Title: 'Deferred Interest Amount',
        row8Title: 'Deferred Non Capitalized Interest',
      },
      buttons: {
        submit: 'Submit',
        back: 'Back',
        continue: 'Continue',
        save: 'Save',
      },
    },
    selectFieldCategAndTypesComponent: {
      inputConstraint: 'Required',
    },

    requestProcessDetailsPage: {
      progressBar: {
        tab1Title: 'Request details',
        tab2Title: 'Initial eligibility',
        tab3Title: 'Underwriting',
        tab4Title: 'Decision',
        tab5Title: 'Closing',
      },
      preliminaryReviewCard: {
        row1Title: 'Request Processing Status:',
        row2Title: 'Request Considered Complete Date',
        row3Title: 'Incomplete Letter Date',
        row4Title: 'Reason for Withdrawal',
        row5Title: 'Withdrawal Date',
        row6Title: 'Denial Date',
        row7Title: 'Status Date',
        row8Title: 'Reopen Workflow',
      },
      requestSummaryCard: {
        cardTitle: 'DLS | Set-Aside Request',
        row1Title: 'Received Date',
        row2Title: 'Approval Date',
      },
      tabs: {
        tab1Title: 'Documents',
        tab2Title: 'Request',
      },
      buttons: {
        beginEligibilityReview: 'Begin eligibility review',
        save: 'Save',
        addDocument: 'Add documents',
        view: 'View',
        download: 'Download',
        new: 'NEW',
      },
      documentsTab: {
        title: 'Set-Aside',
        requestID: 'Request ID:',
        column1Title: 'Documents',
        column2Title: 'Upload Date',
        column3Title: 'Received Date',
        column4Title: 'Source',
        column5Title: 'Actions',
        validDocuments:
          'Documents must be no larger than 6MB. Accepted formats: GIF, JPG, JPEG, PNG, TXT, RTF, PDF, XLS, XLSX, DOC, and DOCX.',
      },
      requestTab: {
        documents: 'Documents',
        justification: 'Justification',
      },
    },

    preClosingPage: {
      tabs: {
        tab1Title: 'Documents',
        tab2Title: 'Request',
      },
      buttons: {
        beginEligibilityReview: 'Begin eligibility review',
        save: 'Save',
        addDocument: 'Add documents',
        view: 'View',
        download: 'Download',
        new: 'NEW',
      },
      requestTab: {
        setAside: 'Set-Aside',
        requestId: "Request ID"
      },
      eligibleLoansTable: {
        title: 'Eligible Loans',
        col1: 'Fund Code/Loan Number',
        col2: 'Date of Loan',
        col3: 'Unpaid Principal',
        col4: 'Unpaid Interest',
        col5: 'Status',
      },
      setAsideCard: {
        title: 'Set-Aside Information',
        distressedBorrowerSetAside: 'Distressed Borrower Set-Aside (DBSA)',
        disasterSetAside: 'Disaster Set-Aside (DSA)',
        disasterCode: 'Disaster Code',
        approvalDate: 'Approval Date',
        installmentDate: 'Installment Date',
        setAsideAmount: 'Set-Aside Amount',
        paymentAfterInstallment: 'Payment After Installment',
        // RECOMMENDATION 5: Updated button text to reflect async processing
        saveButton: 'Save and Generate FSA-2501',
        // RECOMMENDATION 5: New processing status messages
        processingMessages: {
          starting: 'Starting FSA-2501 form generation...',
          formFilling: 'Filling out form fields...',
          pdfGeneration: 'Creating PDF documents...',
          uploading: 'Uploading documents to repository...',
          completing: 'Finalizing set-aside request...',
          completed: 'FSA-2501 form generated successfully!',
          failed: 'Form generation failed. Please try again.',
          savedLocally: 'Request saved locally. Form generation in progress...'
        },
        processingSteps: {
          formFillingStarted: 'Form Generation Started',
          borrowerGroupsCreated: 'Borrower Groups Created',
          pdfGenerationStarted: 'PDF Generation Started',
          documentCreationStarted: 'Document Creation Started',
          uploadStarted: 'Upload Started',
          formFillingCompleted: 'Form Generation Completed',
          formFillingFailed: 'Form Generation Failed'
        }
      },
      screenReader: {
        select: 'Select this row',
      },
    },

    setAsideTableComponent: {
      calculateButton: 'Calculate payoff',
    },

    dataTableComponent: {
      loanType: 'Loan Type',
      dateOfLoan: 'Date of Loan',
      unpaidPrincipal: 'Unpaid Principal',
      annualInstallment: 'Annual Installment',
      status: 'Status',
    },

    requestDetails: {
      confirmSavingMessage: 'This action will lock the answers and update the status of the request to \'Pending Approval\'.',
      continueButton: 'Continue',
      cancelButton: 'Cancel',
    },
    
    // RECOMMENDATION 5: Enhanced processing status messages
    processingStatus: {
      titles: {
        processing: 'Processing Your Request',
        completed: 'Request Completed Successfully',
        failed: 'Request Failed'
      },
      messages: {
        starting: 'Your set-aside request is being processed...',
        formGeneration: 'Generating FSA-2501 form with your loan information...',
        documentCreation: 'Creating PDF documents for your borrowers...',
        uploading: 'Uploading documents to secure storage...',
        finalizing: 'Finalizing your set-aside request...',
        success: 'Your FSA-2501 form has been generated and saved successfully.',
        multipleFormsSuccess: 'Multiple FSA-2501 forms have been generated and packaged into a ZIP file.',
        failure: 'We encountered an issue processing your request. Please try again.',
        timeout: 'Your request is taking longer than expected. Please check back later or contact support.',
        retryPrompt: 'Would you like to try again?'
      },
      buttons: {
        retry: 'Try Again',
        dismiss: 'Dismiss',
        viewDocument: 'View Document',
        downloadDocument: 'Download Document'
      }
    },

    // RECOMMENDATION 2: Real-time update messages
    realTimeUpdates: {
      connected: 'Connected to real-time updates',
      disconnected: 'Connection lost. Status updates may be delayed.',
      reconnecting: 'Reconnecting...',
      stepCompleted: 'Step completed:',
      estimatedTimeRemaining: 'Estimated time remaining:',
      currentStep: 'Current step:'
    },
    
    yes: 'Yes',
    no: 'No',
    save: 'Save',
  },
  taxForm: {
    error: 'Error',
    continue: 'Continue',
    required: 'Required',
    subject: 'Subject',
  },

  setAsidePrintPreview: {
    mainHeader: 'Set Aside Request: Total Payoff',
    setAsideCalculationHeader: 'SET-ASIDE CALCULATION',
    totalPayoffHeader: 'Set Aside Request: Total Payoff',
    payoffSummary: 'PAYOFF SUMMARY',
    principalAmounts: 'Principal Amounts',
    interestAmounts: 'Interest Amounts',
    labels: {
      customerName: 'Customer Name',
      caseNumber: 'Case #',
      accrualDate: 'Accrual Date',
      loanType: 'Loan Type',
      dateOfLoan: 'Date Of Loan',
      unpaidPrincipal: 'Unpaid Principal',
      annualInstallment: 'Annual Installment',
      status: 'Status',
      setAsideEffectiveDate: 'Set-Aside Effective Date',
      principalAmountSetAside: 'Principal Amount Set-Aside',
      interestAmountSetAside: 'Interest Amount Set-Aside',
      installmentDateSetAside: 'Installment Date Set-Aside',
      noteInterestRate: 'Note Interest Rate',
      dateOfLastFinancialActivity: 'Date Of Last Financial Activity',
      presentDBSAInterestRate: 'Present DBSA Interest Rate',
      nonCashCredit: 'NON-CASH CREDIT',
      setAsideTotalAccruedInterest: 'ACCRUED INTEREST',
      accruedInterest: 'Accrued Interest',
      setAsideTotalPayoff: 'TOTAL PAYOFF',
      principalBalance: 'PRINCIPAL BALANCE',
      totalInterest: 'TOTAL INTEREST',
      dailyIntAccrual: 'DAILY INT. ACCRUAL',
      totalPayoff: 'TOTAL PAYOFF',
      dbsaUnpaidPrincipal: 'DBSA Unpaid Principal',
      unpaidNonCapInterest: 'Unpaid Non Capitalized Interest',
      unpaidDeferredInterest: 'Unpaid Deferred Interest',
      unpaidDeferredNonCapInterest: 'Unpaid Deferred Non Capitalized Interest',
      dbsaAccruedInterest: 'DBSA Accrued Interest',
      dbsaUnpaidDeferredInterest: 'DBSA Unpaid Deferred Interest',
      dbsaUnpaidDeferredNonCapInterest:
        'DBSA Unpaid Deferred Non-Capitalized Interest',
    },
  },

  formDetails: {
    name: [
      'FSA-2446',
      // 'Form TBD'
    ],
    description: [
      'This is a description of FSA 2446',
      // 'This is not a form, routes to customer profile for testing'
    ],
    urls: [
      '/servicing/tax-form',
      // 'underwriting/customerProfile'
    ],
  },
  errorGrowl: {
    error: 'Error',
    continue: 'Continue',
  },
};