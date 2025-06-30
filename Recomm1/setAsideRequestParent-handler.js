const { LambdaHandlerResponse, getParameterValue, Logger, validateAllowedOrigins, flpHttpsRequest } = require('/opt/utils');
const { SFNClient, StartExecutionCommand} = require("@aws-sdk/client-sfn"); // Changed from StartSyncExecutionCommand

const cache = {
  stepFunctionArn: null,
  allowedOrigins: null
};

const resetCache = () => {
 cache.stepFunctionArn = null;
 cache.allowedOrigins = null;
};

const logger = new Logger();
const client = new SFNClient();

async function handler (event) {

  logger.debug('event:',event);
  const response = new LambdaHandlerResponse();

  try {

    if (!cache.allowedOrigins) {
      cache.allowedOrigins = await getParameterValue(`${process.env.PNAME_PREFIX}global/ALLOWED_ORIGINS`);
    }
    validateAllowedOrigins(event, cache.allowedOrigins);

    // Extract CORS origin and Authorization header
    const corsOrigin = event.headers?.origin || event.headers?.Origin;
    let authToken = event.headers?.authorization || event.headers?.Authorization;

    // Parse the request body
    const requestBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    // Validate required fields
    const requiredFields = ['rqst_id', 'loan_id', 'task_id', 'addm_dt', 'dstr_dsgt_cd', 'eff_dt', 
           'istl_dt', 'istl_set_asd_amt', 'eauth_id', 'set_asd_type_cd', 'flpCustomerId',
           'caseNumber', 'fundCode', 'loanAmount', 'loanClosingDate', 'loanNumber'];
    
    for (const field of requiredFields) {
        if (!requestBody[field]) {
          const error = Error(`Missing required field: ${field}`);
          error.statusCode = 400;
          throw error;
        }
    }

    if(!cache.stepFunctionArn)
    {
      const sfnArn = process.env.PNAME_API_PREFIX + 'sfn/set-aside-request-parent';
      cache.stepFunctionArn = await getParameterValue(sfnArn);
      logger.debug('cache.stepFunctionArn:',cache.stepFunctionArn)
    }
  
    // Prepare input for Step Function with headers
    const stepFunctionInput = {
        body: requestBody,
        headers: {
            origin: corsOrigin,
            authorization: authToken
        },
        // Add metadata for tracking
        metadata: {
            requestId: requestBody.rqst_id,
            loanId: requestBody.loan_id,
            userId: requestBody.eauth_id,
            timestamp: new Date().toISOString()
        }
    };
    
    // Start ASYNC execution (not sync)
    const command = new StartExecutionCommand({
      stateMachineArn: cache.stepFunctionArn,
      input: JSON.stringify(stepFunctionInput),
      // Use unique execution name for tracking
      name: `setaside-${requestBody.rqst_id}-${requestBody.loan_id}-${Date.now()}`
    });
    
    const executionResult = await client.send(command);
    logger.debug('Async execution started:', executionResult);

    // Return immediately with tracking information
    response.body = {
      requestId: requestBody.rqst_id,
      loanId: requestBody.loan_id,
      executionArn: executionResult.executionArn,
      status: "PROCESSING",
      message: "Your set-aside request is being processed. You'll be notified when the FSA-2501 form is ready.",
      startTime: new Date().toISOString()
    };

  } catch (e) {
    logger.error('Error occurred:',e);
    response.errors = new Array(e.message);
    resetCache();
    response.setError(e.statusCode || 500);
  }

  return response.toAPIGatewayResponse();
}

module.exports = { handler };