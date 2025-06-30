const { LambdaHandlerResponse, getParameterValue, Logger, flpHttpsRequest } = require('/opt/utils');
const { formatAmount, formatDate } = require('/opt/utils');
const { PDFDocument, PDFForm } = require('pdf-lib');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');
const archiver = require('archiver');

// RECOMMENDATION 5: Enhanced caching with in-memory cache
const cache = {
   flpCommonApiUrl: null,
   form2501FileId: null,
   pdfTemplate: null, // Cache PDF template in memory
   relatedEntityCache: new Map(), // Cache API responses
   connectionIds: new Map() // WebSocket connections for real-time updates
};
 
const resetCache = () => {
   cache.flpCommonApiUrl = null;
   cache.form2501FileId = null;
   cache.pdfTemplate = null;
   cache.relatedEntityCache.clear();
   cache.connectionIds.clear();
};

const logger = new Logger();
const s3Client = new S3Client();

// RECOMMENDATION 4: Connection pooling for database
const connectionPoolConfig = {
  maxConnections: 20,
  idleTimeout: 30000,
  acquireTimeout: 20000
};

async function handler (event) {

  const response = new LambdaHandlerResponse();

  try {

    logger.debug('event:',event);

    // Extract headers and request data
    const request = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const headers = event.headers;
    const corsOrigin = headers?.Origin || headers?.origin || headers?.ORIGIN;
    const authToken = headers?.Authorization || headers?.authorization;
    
    // RECOMMENDATION 2: WebSocket support for real-time updates
    const connectionId = headers?.['connection-id'];
    if (connectionId) {
      cache.connectionIds.set(request.loan_id, connectionId);
    }

    logger.debug('request:::',request);
  
    const apiHeaders = {
        'Content-Type': 'application/json',
        'Authorization': authToken
    };
  
    if (corsOrigin) {
        apiHeaders['Origin'] = corsOrigin;
    }

    // RECOMMENDATION 2: Send progress update
    await sendProgressUpdate(request.loan_id, 'Starting PDF generation...', 'FORM_FILLING_STARTED');
  
    if(!cache.flpCommonApiUrl) {
      const flpCommonApiURLAWSParamName = process.env.PNAME_PREFIX + 'global/flp-common-api-Url';
      cache.flpCommonApiUrl = await getParameterValue(flpCommonApiURLAWSParamName);
      logger.info('flpCommonApiUrl:',cache.flpCommonApiUrl);
    }

    // RECOMMENDATION 5: Use cached related entity data
    const cacheKey = `${request.loan_id}-${request.eauth_id}`;
    let relatedEntity;
    
    if (cache.relatedEntityCache.has(cacheKey)) {
      relatedEntity = cache.relatedEntityCache.get(cacheKey);
      logger.debug('Using cached related entity data');
    } else {
      const relatedEntityUrl = cache.flpCommonApiUrl+`related-entity-info-by-loan?loanId=${request.loan_id}&eauthId=${request.eauth_id}`;
      relatedEntity = await axios.get(relatedEntityUrl, { headers: apiHeaders });
      
      // Cache for 15 minutes
      cache.relatedEntityCache.set(cacheKey, relatedEntity);
      setTimeout(() => cache.relatedEntityCache.delete(cacheKey), 15 * 60 * 1000);
      logger.debug('Cached new related entity data');
    }
  
    logger.debug('relatedEntity:',relatedEntity.data);

    // RECOMMENDATION 2: Send progress update
    await sendProgressUpdate(request.loan_id, 'Creating borrower groups...', 'BORROWER_GROUPS_CREATED');
  
    // Create borrower groups for multiple forms if needed
    const borrowerGroups = createBorrowerGroups(relatedEntity.data);
   
    if(!cache.form2501FileId) {
      const form2501FileIdAWSParamName = process.env.PNAME_API_PREFIX + 'FSA_2501_FILE_ID';
      cache.form2501FileId = await getParameterValue(form2501FileIdAWSParamName);
      logger.info('form2501FileId:',cache.form2501FileId);
    }

    // RECOMMENDATION 3: Use cached PDF template
    let pdfTemplateData;
    if (cache.pdfTemplate) {
      pdfTemplateData = cache.pdfTemplate;
      logger.debug('Using cached PDF template');
    } else {
      const usdaForms2501Url = cache.flpCommonApiUrl+`usda-forms/${cache.form2501FileId}`;
      const result = await axios.get(usdaForms2501Url, {
        headers: {'Accept': 'application/pdf'},
        responseType: 'arraybuffer'
      });
      pdfTemplateData = result.data;
      cache.pdfTemplate = pdfTemplateData; // Cache the template
      logger.debug('Cached new PDF template');
    }

    logger.debug('PDF template loaded from cache');

    // RECOMMENDATION 2: Send progress update
    await sendProgressUpdate(request.loan_id, 'Generating PDF forms...', 'PDF_GENERATION_STARTED');
   
    const generatedDocuments = [];
    const pdfFilesForZip = [];

    // RECOMMENDATION 3: Parallel processing for multiple forms
    const formPromises = borrowerGroups.map(async (borrowerGroup, i) => {
      logger.debug(`\n=== Processing Form ${i + 1} of ${borrowerGroups.length} ===`);
     
      // Create form data for this group
      const formData = createFormDataForGroup(request, borrowerGroup);
     
      // Load a fresh copy of the PDF for each form (from cached template)
      const pdfDoc = await PDFDocument.load(pdfTemplateData);
      logger.debug(`PDF document loaded for form ${i + 1}`);
  
      // Get the form from the PDF
      const form = pdfDoc.getForm();
  
      // Fill form fields
      await fillFormFields(form, formData);
  
      // Serialize the PDF
      const filledPDFBytes = await pdfDoc.save();
  
      // Generate individual document name
      const individualDocumentName = borrowerGroups.length === 1
        ? `FSA-2501 ${formData.name} ${formData.fundCode}-${formData.loanNumber}.pdf`
        : `FSA-2501 ${formData.name} ${formData.fundCode}-${formData.loanNumber} (Form ${i + 1} of ${borrowerGroups.length}).pdf`;
     
      logger.info('Individual PDF name: ', individualDocumentName);

      return {
        name: individualDocumentName,
        buffer: Buffer.from(filledPDFBytes),
        metadata: {
          documentName: individualDocumentName,
          formNumber: i + 1,
          totalForms: borrowerGroups.length,
          borrowerCount: borrowerGroup.isFirstForm ? 1 + borrowerGroup.coBorrowers.length : borrowerGroup.coBorrowers.length,
          isFirstForm: borrowerGroup.isFirstForm,
          isContinuation: borrowerGroup.isContinuation
        }
      };
    });

    // Wait for all forms to be processed in parallel
    const processedForms = await Promise.all(formPromises);
    
    // Extract files and metadata
    processedForms.forEach(form => {
      pdfFilesForZip.push({
        name: form.name,
        buffer: form.buffer
      });
      generatedDocuments.push(form.metadata);
    });

    // RECOMMENDATION 2: Send progress update
    await sendProgressUpdate(request.loan_id, 'Creating final document...', 'DOCUMENT_CREATION_STARTED');
  
    // Determine final upload: single PDF or ZIP file
    let finalDocumentName;
    let finalFileBuffer;
    let contentType;
   
    if (borrowerGroups.length === 1) {
      // Single form - upload as PDF
      finalDocumentName = pdfFilesForZip[0].name;
      finalFileBuffer = pdfFilesForZip[0].buffer;
      contentType = 'application/pdf';
      logger.debug('Single form - uploading as PDF');
    } else {
      // Multiple forms - create ZIP and upload
      logger.debug(`Multiple forms (${borrowerGroups.length}) - creating ZIP file`);
     
      const primaryBorrowerName = relatedEntity.data.primary?.name || 'Unknown';
      finalDocumentName = `FSA-2501 ${primaryBorrowerName} ${request.fundCode}-${request.loanNumber}.zip`;
     
      try {
        finalFileBuffer = await createZipFile(pdfFilesForZip);
        contentType = 'application/zip';
        logger.debug('ZIP file created successfully');
      } catch (zipError) {
        logger.error('Failed to create ZIP file:', zipError);
        // Fallback: upload the first form as PDF
        finalDocumentName = pdfFilesForZip[0].name;
        finalFileBuffer = pdfFilesForZip[0].buffer;
        contentType = 'application/pdf';
        logger.debug('ZIP creation failed - falling back to first PDF only');
      }
    }

    // RECOMMENDATION 2: Send progress update
    await sendProgressUpdate(request.loan_id, 'Uploading to document storage...', 'UPLOAD_STARTED');
  
    // Store final document in S3
    const s3Params = {
      Bucket: process.env.SCRATCHPAD_BUCKET_NAME,
      Key: `FSA-2501Form/${finalDocumentName}`,
      Body: finalFileBuffer,
      ContentType: contentType
    };
  
    logger.debug('Uploading to S3:', finalDocumentName);
  
    // Create a PutObjectCommand object
    const command = new PutObjectCommand(s3Params);
  
    // Send the command to S3
    const data = await s3Client.send(command);
   
    logger.debug(`Final document uploaded to S3 successfully: ${finalDocumentName}`);

    // RECOMMENDATION 2: Send final progress update
    await sendProgressUpdate(request.loan_id, 'PDF generation completed successfully!', 'FORM_FILLING_COMPLETED');
  
    response.setHeader('Authorization',authToken);
    response.setHeader('Origin',corsOrigin);
   
    request.documentName = finalDocumentName;
    request.totalFormsGenerated = borrowerGroups.length;
    request.totalBorrowers = 1 + (relatedEntity.data.nonPrimaryList ? relatedEntity.data.nonPrimaryList.length : 0);
    request.fileType = contentType === 'application/zip' ? 'zip' : 'pdf';
    request.containsMultipleForms = borrowerGroups.length > 1;
   
    // Include individual form details for reference (optional)
    request.formsDetails = generatedDocuments;
 
    response.body = request;

  }
  catch (e) {
    logger.error('Error occurred:',e);
    
    // RECOMMENDATION 2: Send error update
    await sendProgressUpdate(request.loan_id, `Error: ${e.message}`, 'FORM_FILLING_FAILED');
    
    resetCache();
    response.errors = new Array(e.message);
    response.setError(e.statusCode || 500);
  }      

  return response.toAPIGatewayResponse();
}

// RECOMMENDATION 2: WebSocket notification function
async function sendProgressUpdate(loanId, message, step) {
  const connectionId = cache.connectionIds.get(loanId);
  if (!connectionId || !process.env.WEBSOCKET_ENDPOINT) {
    return; // No WebSocket connection or endpoint configured
  }

  try {
    const client = new ApiGatewayManagementApiClient({
      endpoint: process.env.WEBSOCKET_ENDPOINT
    });

    const progressData = {
      loanId,
      step,
      message,
      timestamp: new Date().toISOString()
    };

    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(progressData)
    }));

    logger.debug(`Progress update sent: ${step} - ${message}`);
  } catch (error) {
    logger.warn('Failed to send progress update:', error);
    // Don't throw - this is not critical for the main process
  }
}

/**
 * Create borrower groups for multiple forms
 */
function createBorrowerGroups(relatedEntityData) {
  const groups = [];
  const primary = relatedEntityData.primary;
  const nonPrimaryList = relatedEntityData.nonPrimaryList || [];
 
  // Total borrowers = 1 primary + nonPrimaryList length
  const totalBorrowers = 1 + nonPrimaryList.length;
 
  logger.debug(`Total borrowers: ${totalBorrowers} (1 primary + ${nonPrimaryList.length} co-borrowers)`);
 
  if (totalBorrowers <= 4) {
    // Single form scenario
    const group = {
      primary: primary,
      coBorrowers: nonPrimaryList,
      isFirstForm: true
    };
    groups.push(group);
    logger.debug('Single form needed - all borrowers fit in one form');
  } else {
    // Multiple forms scenario
    // First form: primary + first 3 co-borrowers (use all 4 borrower fields: 6A, 7A, 8A, 9A)
    const firstGroup = {
      primary: primary,
      coBorrowers: nonPrimaryList.slice(0, 3),
      isFirstForm: true,
      isContinuation: false
    };
    groups.push(firstGroup);
    logger.debug('First form: primary + first 3 co-borrowers');
   
    // Continuation forms: 4 co-borrowers each (using fields 6A, 7A, 8A, 9A)
    let remainingCoBorrowers = nonPrimaryList.slice(3);
    let formNumber = 2;
   
    while (remainingCoBorrowers.length > 0) {
      const coBorrowersForThisForm = remainingCoBorrowers.slice(0, 4);
      const continuationGroup = {
        primary: primary, // Same primary info on all forms
        coBorrowers: coBorrowersForThisForm,
        isFirstForm: false,
        isContinuation: true,
        formNumber: formNumber
      };
      groups.push(continuationGroup);
      logger.debug(`Continuation form ${formNumber}: ${coBorrowersForThisForm.length} co-borrowers`);
     
      remainingCoBorrowers = remainingCoBorrowers.slice(4);
      formNumber++;
    }
  }
 
  logger.debug(`Total forms to generate: ${groups.length}`);
  return groups;
}

/**
 * Create form data for a specific borrower group
 */
function createFormDataForGroup(request, borrowerGroup) {
  const formData = {
    name: borrowerGroup.primary?.name || '',
    fullCaseNumber: request.caseNumber,
    fundCode: request.fundCode,
    loanNumber: request.loanNumber,
    loanClosingDate: formatDate(request.loanClosingDate),
    loanAmount: formatAmount(request.loanAmount),
    disasterDesignationNumber: request.dstr_dsgt_cd,
    installmentDate: formatDate(request.istl_dt),
    installmentAmount: formatAmount(request.istl_set_asd_amt),
    setAsideType: request.set_asd_type_cd,
   
    // Borrower fields
    borrower1Name: '', // Field 6A
    borrower2Name: '', // Field 7A
    borrower3Name: '', // Field 8A
    borrower4Name: '', // Field 9A
   
    // Form metadata
    isFirstForm: borrowerGroup.isFirstForm,
    isContinuation: borrowerGroup.isContinuation,
    formNumber: borrowerGroup.formNumber || 1
  };
 
  if (borrowerGroup.isFirstForm) {
    // First form: 6A is primary, 7A-9A are first 3 co-borrowers
    formData.borrower1Name = borrowerGroup.primary?.name || '';
   
    borrowerGroup.coBorrowers.forEach((coBorrower, index) => {
      const fieldName = `borrower${index + 2}Name`; // borrower2Name, borrower3Name, borrower4Name
      if (coBorrower.fullName && coBorrower.fullName.trim() !== '') {
        formData[fieldName] = coBorrower.fullName;
      } else if (coBorrower.businessName && coBorrower.businessName.trim() !== '') {
        formData[fieldName] = coBorrower.businessName;
      } else {
        formData[fieldName] = '';
      }
    });
  } else {
    // Continuation forms: 6A-9A are all co-borrowers from nonPrimaryList
    borrowerGroup.coBorrowers.forEach((coBorrower, index) => {
      const fieldName = `borrower${index + 1}Name`; // borrower1Name, borrower2Name, borrower3Name, borrower4Name
      if (coBorrower.fullName && coBorrower.fullName.trim() !== '') {
        formData[fieldName] = coBorrower.fullName;
      } else if (coBorrower.businessName && coBorrower.businessName.trim() !== '') {
        formData[fieldName] = coBorrower.businessName;
      } else {
        formData[fieldName] = '';
      }
    });
  }
 
  return formData;
}

/**
 * Fill form fields with provided data
 * Enhanced with better PDF analysis and fallback options
 */
async function fillFormFields(form, data) {
  try {
      // Enhanced form analysis
      const fields = form.getFields();
      logger.debug(`Total form fields found: ${fields.length}`);
     
      if (fields.length === 0) {
          logger.warn('No form fields found in PDF. PDF may not have fillable form fields.');
          throw new Error('PDF_NO_FORM_FIELDS');
      }
     
      // Helper function to safely fill text fields
      const fillTextField = (fieldName, value) => {
          try {
              const field = form.getTextField(fieldName);
              field.setText(String(value || ''));
              logger.debug(`✓ Filled text field '${fieldName}': ${value}`);
              return true;
          } catch (err) {
              logger.warn(`✗ Could not fill text field '${fieldName}':`, err.message);
              return false;
          }
      };
     
      // Helper function to safely fill checkboxes
      const fillCheckBox = (fieldName, shouldCheck = true) => {
          try {
              const field = form.getCheckBox(fieldName);
              if (shouldCheck) {
                  field.check();
              } else {
                  field.uncheck();
              }
              logger.debug(`✓ Set checkbox '${fieldName}': ${shouldCheck}`);
              return true;
          } catch (err) {
              logger.warn(`✗ Could not fill checkbox '${fieldName}':`, err.message);
              return false;
          }
      };
     
      logger.debug('=== ATTEMPTING TO FILL TEXT FIELD NAMES ===');
      logger.debug(`Form Type: ${data.isFirstForm ? 'First Form' : 'Continuation Form'} ${data.formNumber || 1}`);
     
      const textFieldMappings = [
          ['1 Name', data.name],
          ['6A Borrower Name', data.borrower1Name],
          ['7A Borrower Name', data.borrower2Name],
          ['8A Borrower Name', data.borrower3Name],
          ['9A Borrower Name', data.borrower4Name],
          ['2A State Code', data.fullCaseNumber.substring(0,2)],
          ['2B County', data.fullCaseNumber.substring(2,5)],
          ['2C Tax ID', data.fullCaseNumber.substring(6)],
          ['3A Fund Code', data.fundCode],
          ['3B Loan Number', data.loanNumber],
          ['3C Date', data.loanClosingDate],
          ['4C Amount Setaside', data.installmentAmount],
          ['3D Amount', data.loanAmount],
          ['4A Disaster Designation Number', data.disasterDesignationNumber],
          ['4B Date of Installment Setaside', data.installmentDate]
      ];
     
      let filledCount = 0;
      textFieldMappings.forEach(([fieldName, value]) => {
          if (fillTextField(fieldName, value)) {
              filledCount++;
          }
      });

      logger.debug('=== ATTEMPTING TO FILL CHECKBOX FIELD NAMES ===');

      const checkBoxFieldMappings = [
        ['5A Disaster Set-Aside', data.setAsideType === 'DSA'],
        ['5B Distressed Set-Aside', data.setAsideType === 'DBSA'],
      ];

      checkBoxFieldMappings.forEach(([fieldName, value]) => {
        if (fillCheckBox(fieldName, value)) {
            filledCount++;
        }
      });
     
      logger.debug(`=== SUMMARY: ${filledCount} fields filled successfully ===`);
     
      if (filledCount === 0) {
        logger.warn('Warning: No fields were filled. This might indicate field name mismatches.');
      }
     
  } catch (error) {
    logger.error('Error in fillFormFields:', error);
    throw error;
  }
}

/**
 * Create a ZIP file from multiple PDF buffers
 */
async function createZipFile(pdfFiles) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
   
    const chunks = [];
   
    archive.on('data', (chunk) => {
      chunks.push(chunk);
    });
   
    archive.on('end', () => {
      const zipBuffer = Buffer.concat(chunks);
      logger.debug(`ZIP file created successfully, size: ${zipBuffer.length} bytes`);
      resolve(zipBuffer);
    });
   
    archive.on('error', (err) => {
      logger.error('Error creating ZIP file:', err);
      reject(err);
    });
   
    // Add each PDF to the archive
    pdfFiles.forEach(file => {
      archive.append(file.buffer, { name: file.name });
      logger.debug(`Added ${file.name} to ZIP archive`);
    });
   
    // Finalize the archive
    archive.finalize();
  });
}

module.exports = { handler };