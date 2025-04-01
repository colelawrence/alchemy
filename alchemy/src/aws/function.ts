import {
  Architecture,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ResourceNotFoundException,
  Runtime,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import fs from "node:fs";
import path from "node:path";
import type { Context } from "../context";
import { Resource } from "../resource";
import { ignore } from "../util/ignore";

/**
 * Properties for creating or updating a Lambda function
 */
export interface FunctionProps {
  /**
   * Name of the Lambda function
   */
  functionName: string;

  /**
   * Path to the zip file containing the function code
   */
  zipPath: string;

  /**
   * ARN of the IAM role that Lambda assumes when executing the function
   */
  roleArn: string;

  /**
   * Function handler in the format 'file.function'
   * For Node.js this is typically 'index.handler' or similar
   */
  handler?: string;

  /**
   * Lambda runtime environment for the function
   * @default nodejs20.x if not specified
   */
  runtime?: Runtime;

  /**
   * CPU architecture for the function
   * @default x86_64 if not specified
   */
  architecture?: Architecture;

  /**
   * Description of the function's purpose
   */
  description?: string;

  /**
   * Maximum execution time in seconds
   * @default 3 seconds if not specified
   */
  timeout?: number;

  /**
   * Amount of memory available to the function in MB
   * @default 128 MB if not specified
   */
  memorySize?: number;

  /**
   * Environment variables available to the function code
   */
  environment?: Record<string, string>;

  /**
   * Resource tags for the function
   */
  tags?: Record<string, string>;

  /**
   * Function URL configuration for direct HTTP(S) invocation
   */
  url?: {
    /**
     * Authentication type for the function URL
     */
    authType?: "AWS_IAM" | "NONE";

    /**
     * CORS configuration for the function URL
     */
    cors?: {
      /**
       * Whether to allow credentials in CORS requests
       */
      allowCredentials?: boolean;

      /**
       * Allowed headers in CORS requests
       */
      allowHeaders?: string[];

      /**
       * Allowed HTTP methods in CORS requests
       */
      allowMethods?: string[];

      /**
       * Allowed origins in CORS requests
       */
      allowOrigins?: string[];

      /**
       * Headers exposed to the browser
       */
      exposeHeaders?: string[];

      /**
       * CORS preflight cache time in seconds
       */
      maxAge?: number;
    };
  };
}

/**
 * Output returned after Lambda function creation/update
 */
export interface Function extends Resource<"lambda::Function">, FunctionProps {
  /**
   * ARN of the Lambda function
   */
  arn: string;

  /**
   * Timestamp of the last function modification
   */
  lastModified: string;

  /**
   * Function version
   */
  version: string;

  /**
   * ARN with version suffix
   */
  qualifiedArn: string;

  /**
   * ARN for invoking the function through API Gateway
   */
  invokeArn: string;

  /**
   * SHA256 hash of the function code
   */
  sourceCodeHash: string;

  /**
   * Size of the function code in bytes
   */
  sourceCodeSize: number;

  /**
   * Size of ephemeral storage (/tmp) in MB
   */
  ephemeralStorageSize?: number;

  /**
   * List of supported CPU architectures
   */
  architectures: string[];

  /**
   * ARN of the master function (Lambda@Edge only)
   */
  masterArn?: string;

  /**
   * Unique identifier for the current function code/config
   */
  revisionId: string;

  /**
   * Current state of the function
   */
  state?: string;

  /**
   * Reason for the current state
   */
  stateReason?: string;

  /**
   * Code for the current state reason
   */
  stateReasonCode?: string;

  /**
   * Status of the last update operation
   */
  lastUpdateStatus?: string;

  /**
   * Reason for the last update status
   */
  lastUpdateStatusReason?: string;

  /**
   * Code for the last update status reason
   */
  lastUpdateStatusReasonCode?: string;

  /**
   * Function package type (Zip or Image)
   */
  packageType: string;

  /**
   * ARN of the signing profile version
   */
  signingProfileVersionArn?: string;

  /**
   * ARN of the signing job
   */
  signingJobArn?: string;
}

/**
 * AWS Lambda Function Resource
 *
 * Creates and manages AWS Lambda functions with support for Node.js runtimes, custom handlers,
 * environment variables, and function URLs. Handles deployment packaging, IAM role
 * stabilization, and function updates.
 *
 * @example
 * // Create a basic Lambda function with minimal configuration
 * const basicFunction = await Function("api-handler", {
 *   functionName: "api-handler",
 *   zipPath: "./dist/api.zip",
 *   roleArn: role.arn,
 *   runtime: Runtime.nodejs20x,
 *   handler: "index.handler",
 *   tags: {
 *     Environment: "production"
 *   }
 * });
 *
 * @example
 * // Create a function with environment variables and custom memory/timeout
 * const configuredFunction = await Function("worker", {
 *   functionName: "worker",
 *   zipPath: "./dist/worker.zip",
 *   roleArn: role.arn,
 *   runtime: Runtime.nodejs20x,
 *   handler: "worker.process",
 *   memorySize: 512,
 *   timeout: 30,
 *   environment: {
 *     QUEUE_URL: queue.url,
 *     LOG_LEVEL: "info"
 *   }
 * });
 *
 * @example
 * // Create a function with a public URL endpoint and CORS
 * const apiFunction = await Function("public-api", {
 *   functionName: "public-api",
 *   zipPath: "./dist/api.zip",
 *   roleArn: role.arn,
 *   handler: "api.handler",
 *   url: {
 *     authType: "NONE",
 *     cors: {
 *       allowOrigins: ["*"],
 *       allowMethods: ["GET", "POST"],
 *       allowHeaders: ["content-type"],
 *       maxAge: 86400
 *     }
 *   }
 * });
 */
export const Function = Resource(
  "lambda::Function",
  async function (this: Context<Function>, id: string, props: FunctionProps) {
    const client = new LambdaClient({});
    const region = await resolveRegion(client);

    const code = await zipCode(props.zipPath);

    if (this.phase === "delete") {
      await ignore(ResourceNotFoundException.name, () =>
        client.send(
          new DeleteFunctionCommand({
            FunctionName: props.functionName,
          }),
        ),
      );

      return this.destroy();
    } else {
      try {
        // Check if function exists
        await client.send(
          new GetFunctionCommand({
            FunctionName: props.functionName,
          }),
        );

        if (this.phase === "update") {
          // Wait for function to stabilize
          await waitForFunctionStabilization(client, props.functionName);

          // Update function code
          await client.send(
            new UpdateFunctionCodeCommand({
              FunctionName: props.functionName,
              ZipFile: code,
            }),
          );

          // Wait for code update to stabilize
          await waitForFunctionStabilization(client, props.functionName);

          // Update function configuration
          await client.send(
            new UpdateFunctionConfigurationCommand({
              FunctionName: props.functionName,
              Handler: props.handler,
              Runtime: props.runtime,
              Role: props.roleArn,
              Description: props.description,
              Timeout: props.timeout,
              MemorySize: props.memorySize,
              Environment: props.environment
                ? { Variables: props.environment }
                : undefined,
            }),
          );

          // Wait for configuration update to stabilize
          await waitForFunctionStabilization(client, props.functionName);
        }
      } catch (error: any) {
        if (error.name === "ResourceNotFoundException") {
          // Create function if it doesn't exist
          const startTime = Date.now();
          let delay = 100; // Start with 100ms delay

          while (true) {
            try {
              await client.send(
                new CreateFunctionCommand({
                  FunctionName: props.functionName,
                  Code: { ZipFile: code },
                  Handler: props.handler || "index.handler",
                  Runtime: props.runtime || Runtime.nodejs20x,
                  Role: props.roleArn,
                  Description: props.description,
                  Timeout: props.timeout || 3,
                  MemorySize: props.memorySize || 128,
                  Environment: props.environment
                    ? { Variables: props.environment }
                    : undefined,
                  Architectures: props.architecture
                    ? [props.architecture]
                    : [Architecture.x86_64],
                  Tags: props.tags,
                }),
              );
              break; // Success - exit retry loop
            } catch (createError: any) {
              if (
                createError.name !== "InvalidParameterValueException" ||
                !createError.message?.includes("cannot be assumed by Lambda")
              ) {
                throw createError; // Different error - rethrow
              }

              if (Date.now() - startTime > 10000) {
                throw new Error(
                  "Timeout waiting for IAM role to be assumable by Lambda after 10s",
                );
              }

              await new Promise((resolve) => setTimeout(resolve, delay));
              delay = Math.min(delay * 2, 1000); // Exponential backoff capped at 1s
            }
          }

          // Wait for function to be active
          let isCreating = true;
          while (isCreating) {
            const config = await client.send(
              new GetFunctionConfigurationCommand({
                FunctionName: props.functionName,
              }),
            );
            isCreating = config.State === "Pending";
            if (isCreating) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } else {
          throw error;
        }
      }

      // Get complete function details
      const [func, config] = await Promise.all([
        client.send(
          new GetFunctionCommand({
            FunctionName: props.functionName,
          }),
        ),
        client.send(
          new GetFunctionConfigurationCommand({
            FunctionName: props.functionName,
          }),
        ),
      ]);

      return this({
        ...props,
        arn: config.FunctionArn!,
        lastModified: config.LastModified!,
        version: config.Version!,
        qualifiedArn: `${config.FunctionArn}:${config.Version}`,
        invokeArn: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${config.FunctionArn}/invocations`,
        sourceCodeHash: config.CodeSha256!,
        sourceCodeSize: config.CodeSize!,
        ephemeralStorageSize: config.EphemeralStorage?.Size,
        architectures: config.Architectures || [],
        masterArn: config.MasterArn,
        revisionId: config.RevisionId!,
        state: config.State,
        stateReason: config.StateReason,
        stateReasonCode: config.StateReasonCode,
        lastUpdateStatus: config.LastUpdateStatus,
        lastUpdateStatusReason: config.LastUpdateStatusReason,
        lastUpdateStatusReasonCode: config.LastUpdateStatusReasonCode,
        packageType: config.PackageType!,
        signingProfileVersionArn: config.SigningProfileVersionArn,
        signingJobArn: config.SigningJobArn,
      });
    }
  },
);

// Helper to wait for function to stabilize
async function waitForFunctionStabilization(
  client: LambdaClient,
  functionName: string,
) {
  while (true) {
    const config = await client.send(
      new GetFunctionConfigurationCommand({
        FunctionName: functionName,
      }),
    );

    // Check if function is in a stable state
    if (config.State === "Active" && config.LastUpdateStatus === "Successful") {
      break;
    }

    // If there's a failure, throw an error
    if (config.State === "Failed" || config.LastUpdateStatus === "Failed") {
      throw new Error(
        `Function failed to stabilize: ${config.StateReason || config.LastUpdateStatusReason}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Helper to zip the code
async function zipCode(filePath: string): Promise<Buffer> {
  const fileContent = await fs.promises.readFile(filePath);
  const fileName = path.basename(filePath);

  // Create a zip buffer in memory
  const zip = new (await import("jszip")).default();
  zip.file(fileName, fileContent);
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "UNIX",
  });
}

async function resolveRegion(client: LambdaClient): Promise<string> {
  const region = client.config.region;
  if (typeof region === "string") return region;
  if (typeof region === "function") return region();
  throw new Error("Could not resolve AWS region");
}
