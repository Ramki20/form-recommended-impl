const { fpacPrismaClient } = require('/opt/prisma');
const { LambdaHandlerResponse, Logger } = require('/opt/utils');

// RECOMMENDATION 4: Connection pooling configuration
const PRISMA_CONFIG = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=20&pool_timeout=20&socket_timeout=20"
    }
  },
  log: ['error'],
  errorFormat: 'minimal'
};

let prisma = null;
const logger = new Logger();

/**
 * Creates a record in set_asd.set_asd_set_asd_rqst with optimized database operations.
 * @param {*} event The API Gateway event with set aside data in body
 * @returns The inserted data
 */
async function handler(event) {
  const lambdaHandlerResponse = new LambdaHandlerResponse();

  try {
    const request =
      typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

    logger.debug('parsed event.body: ', request);
    logger.info('loan_id: ', request.loan_id);
    logger.info('request_id: ', request.rqst_id);

    let setAsideRequestData = null;

    if (request) {
      // RECOMMENDATION 4: Initialize Prisma with connection pooling if not already done
      if (!prisma) {
        prisma = await fpacPrismaClient(PRISMA_CONFIG);
        logger.debug('Prisma client initialized with connection pooling');
      }

      const taskId = parseInt(request.task_id);
      const requestId = parseInt(request.rqst_id);
      const loanId = parseInt(request.loan_id);
      const docId = parseInt(request.doc_id);

      // RECOMMENDATION 4: Optimized transaction with parallel operations where possible
      await prisma.$transaction(async (prisma) => {
        // Prepare data objects
        const setAsideData = {
          task_id: taskId,
          rqst_id: requestId,
          loan_id: loanId,
          addm_dt: request.addm_dt ? new Date(request.addm_dt) : null,
          dstr_dsgt_cd: request.dstr_dsgt_cd,
          set_asd_type_cd: request.set_asd_type_cd,
          eff_dt: request.eff_dt ? new Date(request.eff_dt) : null,
          istl_dt: request.istl_dt ? new Date(request.istl_dt) : null,
          istl_set_asd_amt: parseFloat(
            request.istl_set_asd_amt.toString().replace(/,/g, '')
          ),
          istl_paid_amt: parseFloat(
            request.istl_paid_amt.toString().replace(/,/g, '')
          ),
          cre_user_nm: request.eauth_id,
          last_chg_user_nm: request.eauth_id,
          data_stat_cd: 'A',
          cre_dt: new Date(),
          last_chg_dt: new Date(),
        };

        const docData = docId ? {
          doc_id: docId,
          data_stat_cd: 'A',
          cre_user_nm: request.eauth_id,
          last_chg_user_nm: request.eauth_id,
          doc_type: {
            connect: {
              doc_type_cd: 'OTH',
            },
          },
          rqst: {
            connect: {
              rqst_id: requestId,
            },
          },
        } : null;

        // Execute operations - can run in parallel if docId is present
        if (docId) {
          // Run both operations in parallel when document is involved
          const [setAsideResult, requestDocResult] = await Promise.all([
            prisma.set_asd_set_asd_rqst.create({ data: setAsideData }),
            prisma.rqst_doc.create({ data: docData })
          ]);
          
          setAsideRequestData = setAsideResult;
          logger.info('requestDoc:', requestDocResult);
          
          // Add document info to response
          setAsideRequestData.documentName = request.documentName;
          setAsideRequestData.documentId = requestDocResult.doc_id;
        } else {
          // Only create set aside request if no document
          setAsideRequestData = await prisma.set_asd_set_asd_rqst.create({
            data: setAsideData
          });
        }

        logger.info('setAsideRequestData in lambda: ', setAsideRequestData);
        lambdaHandlerResponse.body = { setAsideRequestData };
        
      }, { 
        timeout: 10000, // 10 second timeout
        maxWait: 5000,  // Maximum time to wait for transaction to start
        isolationLevel: 'ReadCommitted' // Use appropriate isolation level
      });
    } else {
      lambdaHandlerResponse.body = null;
      logger.info('Request object is null');
    }
  } catch (error) {
    logger.error('Error: ', error);
    
    // RECOMMENDATION 4: Handle connection issues gracefully
    if (error.code === 'P2024' || error.message.includes('connection')) {
      logger.warn('Database connection issue detected, resetting connection pool');
      prisma = null; // Force reconnection on next request
    }
    
    lambdaHandlerResponse.errors = [error.message];
    lambdaHandlerResponse.setError(500);
  }

  return lambdaHandlerResponse.toAPIGatewayResponse();
}

// RECOMMENDATION 4: Graceful shutdown handler for connection cleanup
process.on('SIGTERM', async () => {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database connections closed gracefully');
  }
});

module.exports = { handler };