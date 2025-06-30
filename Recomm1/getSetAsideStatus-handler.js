const { LambdaHandlerResponse, getParameterValue, Logger, validateAllowedOrigins } = require('/opt/utils');
const { SFNClient, DescribeExecutionCommand } = require("@aws-sdk/client-sfn");

const cache = {
  allowedOrigins: null
};

const resetCache = () => {
  cache.allowedOrigins = null;
};

const logger = new Logger();
const client = new SFNClient();

async function handler(event) {
  logger.debug('Status check event:', event);
  const response = new LambdaHandlerResponse();

  try {
    if (!cache.allowedOrigins) {
      cache.allowedOrigins = await getParameterValue(`${process.env.PNAME_PREFIX}global/ALLOWED_ORIGINS`);
    }
    validateAllowedOrigins(event, cache.allowedOrigins);

    const corsOrigin = event.headers?.origin || event.headers?.Origin;
    const authToken = event.headers?.authorization || event.headers?.Authorization;

    // Get execution ARN from path parameters
    const executionArn = event.pathParameters?.executionArn;
    if (!executionArn) {
      const error = new Error('Execution ARN is required');
      error.statusCode = 400;
      throw error;
    }

    // Decode the ARN (it might be URL encoded)
    const decodedExecutionArn = decodeURIComponent(executionArn);

    const command = new DescribeExecutionCommand({
      executionArn: decodedExecutionArn
    });

    const executionResult = await client.send(command);
    logger.debug('Execution status:', executionResult);

    let responseData = {
      executionArn: decodedExecutionArn,
      status: executionResult.status,
      startDate: executionResult.startDate,
      stopDate: executionResult.stopDate || null
    };

    // Parse the output if execution is complete
    if (executionResult.status === 'SUCCEEDED' && executionResult.output) {
      try {
        const output = JSON.parse(executionResult.output);
        responseData.result = {
          documentName: output.body?.documentName,
          totalFormsGenerated: output.body?.totalFormsGenerated,
          fileType: output.body?.fileType,
          containsMultipleForms: output.body?.containsMultipleForms,
          formsDetails: output.body?.formsDetails
        };
      } catch (parseError) {
        logger.warn('Failed to parse execution output:', parseError);
        responseData.result = { message: 'Processing completed but result format is invalid' };
      }
    } else if (executionResult.status === 'FAILED') {
      responseData.error = {
        message: 'Processing failed',
        details: executionResult.cause || 'Unknown error occurred'
      };
    } else if (executionResult.status === 'TIMED_OUT') {
      responseData.error = {
        message: 'Processing timed out',
        details: 'The request took too long to process'
      };
    }

    response.setHeader('Authorization', authToken);
    response.setHeader('Origin', corsOrigin);
    response.body = responseData;

  } catch (e) {
    logger.error('Error checking execution status:', e);
    response.errors = [e.message];
    resetCache();
    response.setError(e.statusCode || 500);
  }

  return response.toAPIGatewayResponse();
}

module.exports = { handler };