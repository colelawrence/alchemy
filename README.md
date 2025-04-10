# Alchemy

Alchemy is an embeddable, zero-dependency, TypeScript-native Infrastructure-as-Code (IaC) library for modeling Resources that are Created, Updated and Deleted automatically.

Unlike similar tools like Pulumi, Terraform, and CloudFormation, Alchemy is implemented in pure ESM-native TypeScript code with zero dependencies.

Resources are simple memoized async functions that can run in any JavaScript runtime, including the browser, serverless functions and durable workflows.

```ts
import alchemy from "alchemy";

// initialize the app (with default state $USER)
const app = await alchemy("cloudflare-worker");

// create a Cloudflare Worker
export const worker = await Worker("worker", {
  name: "my-worker",
  entrypoint: "./src/index.ts",
  bindings: {
    COUNTER: counter,
    STORAGE: storage,
    AUTH_STORE: authStore,
    GITHUB_CLIENT_ID: alchemy.secret(process.env.GITHUB_CLIENT_ID),
    GITHUB_CLIENT_SECRET: alchemy.secret(process.env.GITHUB_CLIENT_SECRET),
  },
});

// finalize the alchemy app (triggering deletion of orphaned resources)
await app.finalize();
```

# Features

- **JS-native** - no second language, toolchains, dependencies, processes, services, etc. to lug around.
- **Async-native** - resources are just async functions - no complex abstraction to learn.
- **ESM-native** - built exclusively on ESM, with a slight preference for modern JS runtimes like Bun.
- **Embeddable** - runs in any JavaScript/TypeScript environment, including the browser!
- **Extensible** - implement your own resources with a simple function.
- **AI-first** - alchemy actively encourages you to use LLMs to create/copy/fork/modify resources to fit your needs. No more waiting around for a provider to be implemented, just do it yourself in a few minutes.
- **No dependencies** - the `alchemy` core package has 0 required dependencies.
- **No service** - state files are stored locally in your project and can be easily inspected, modified, checked into your repo, etc.
- **No strong opinions** - structure your codebase however you want, store state anywhere - we don't care!

# Examples

- CloudFlare ViteJS Website + API Backend with Durable Objects: [examples/cloudflare-vite/](./examples/cloudflare-vite/alchemy.run.ts)
- Deploy an AWS Lambda Function with a DynamoDB Table and IAM Role: [examples/aws-app/](./examples/aws-app/alchemy.run.ts)

# Getting Started

See the [Getting Started Guide](https://alchemy.run/docs/getting-started.html).
