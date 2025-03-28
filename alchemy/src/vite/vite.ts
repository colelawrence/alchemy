import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { Context } from "../context";
import { Resource } from "../resource";
import { ShadcnComponent } from "../shadcn/component";
import { rm } from "../util/rm";

const execAsync = promisify(exec);

type ViteTemplate =
  | "vanilla"
  | "vanilla-ts"
  | "vue"
  | "vue-ts"
  | "react"
  | "react-ts"
  | "react-swc"
  | "react-swc-ts"
  | "preact"
  | "preact-ts"
  | "lit"
  | "lit-ts"
  | "svelte"
  | "svelte-ts"
  | "solid"
  | "solid-ts"
  | "qwik"
  | "qwik-ts";

export interface ViteProjectProps {
  /**
   * The name/path of the project
   */
  name: string;
  /**
   * The Vite template to use
   */
  template: ViteTemplate;
  /**
   * The extends to add to the tsconfig.json file
   */
  extends?: string;
  /**
   * The references to add to the tsconfig.json file
   */
  references?: string[];
  /**
   * Add Tailwind CSS to the project
   * @default false
   */
  tailwind?: boolean;
  /**
   * Add Tanstack Router to the project
   * @default false
   */
  tanstack?: boolean;
  /**
   * Add Shadcn UI to the project
   * @default false
   */
  shadcn?: {
    /**
     * The base color to use
     * @default "neutral"
     */
    baseColor?: "neutral" | "gray" | "zinc" | "stone" | "slate";
    /**
     * Use default configuration
     * @default false
     */
    defaults?: boolean;

    /**
     * Force overwrite of existing configuration
     * @default false
     */
    force?: boolean;

    /**
     * The working directory
     * @default current directory
     */
    cwd?: string;

    /**
     * Mute output
     * @default false
     */
    silent?: boolean;

    /**
     * Use the src directory when creating a new project
     * @default false
     */
    srcDir?: boolean;

    /**
     * Use css variables for theming
     * @default true
     */
    cssVariables?: boolean;

    /**
     * The components to add
     */
    components?: string[];
  };
  /**
   * Force overwrite the project config files during the update phase
   *
   * @default false
   */
  overwrite?: boolean;
}

export interface ViteProject extends ViteProjectProps, Resource {
  /**
   * The name/path of the project
   */
  name: string;
}

export const ViteProject = Resource(
  "project::ViteProject",
  {
    alwaysUpdate: true,
  },
  async function (
    this: Context<ViteProject>,
    id: string,
    props: ViteProjectProps,
  ): Promise<ViteProject> {
    const phase = this.phase;
    if (this.phase === "delete") {
      try {
        if (await fs.exists(props.name)) {
          // TODO: OS agnostic - fs.rm is slow to delete node_modules/
          await execAsync("rm -rf " + props.name);
        }
      } catch (error) {
        console.error(`Error deleting project ${id}:`, error);
      }
      return this.destroy();
    }

    if (this.phase === "update") {
      if (props.overwrite) {
        await modifyConfig(props);
      } else {
        console.warn(
          "ViteProject does not support updates - the project must be recreated to change the template",
        );
      }
    } else {
      await execAsync(`bun create vite ${id} --template ${props.template}`);

      await modifyConfig(props);
    }

    return this(props);

    async function modifyConfig(props: ViteProjectProps) {
      const tailwind = props.tailwind ?? false;
      const tanstack = props.tanstack ?? false;

      const plugins = [
        tailwind && "tailwindcss()",
        tanstack &&
          "TanStackRouterVite({ target: 'react', autoCodeSplitting: true })",
        "react()",
      ].filter((s) => typeof s === "string");

      const cwd = path.resolve(process.cwd(), props.name);

      const exec = (command: string) => execAsync(command, { cwd });

      if (phase === "create" || props.overwrite) {
        await removeUnnecessaryFiles();
      }

      await patchTsConfig();

      if (props.tailwind) {
        await installTailwind();
      }

      if (props.tanstack) {
        await installTanstack();
      }

      if (props.shadcn !== undefined) {
        await installShadcn();
      }

      await build();

      async function build() {
        // tsc -b will fail if we have not invoked tan stacks' code gen
        await execAsync(`bun vite build`, { cwd: props.name });
      }

      async function installTailwind() {
        await exec(`bun add tailwindcss @tailwindcss/vite`);

        await fs.writeFile(
          path.join(props.name, "vite.config.ts"),
          `import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
${tailwind ? "import tailwindcss from '@tailwindcss/vite';" : ""}
${tanstack ? 'import { TanStackRouterVite } from "@tanstack/router-plugin/vite";' : ""}

// https://vite.dev/config/
export default defineConfig({
  plugins: [${plugins.join(", ")}],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});`,
        );

        // Add Tailwind CSS import to index.css
        const indexCssPath = path.join(props.name, "src", "index.css");
        const currentCss = await fs.readFile(indexCssPath, "utf-8");
        if (!currentCss.includes('@import "tailwindcss";')) {
          await fs.writeFile(
            indexCssPath,
            '@import "tailwindcss";\n\n' + currentCss,
          );
        }
      }

      async function installShadcn() {
        await exec("bun add -D @types/node");

        // Build the shadcn init command with all options
        const shadcnOptions = props.shadcn;
        const initCommand = [
          "bunx --bun shadcn@latest init",
          shadcnOptions?.baseColor && `-b ${shadcnOptions.baseColor}`,
          shadcnOptions?.defaults && "-d",
          shadcnOptions?.force && "-f",
          shadcnOptions?.cwd && `-c ${shadcnOptions.cwd}`,
          shadcnOptions?.silent && "-s",
          shadcnOptions?.srcDir && "--src-dir",
          shadcnOptions?.cssVariables === false && "--no-css-variables",
        ]
          .filter(Boolean)
          .join(" ");

        await exec(initCommand);

        // Install requested components using the ShadcnComponent resource
        for (const componentName of props.shadcn?.components ?? []) {
          await ShadcnComponent(`shadcn-component-${componentName}`, {
            name: componentName,
            cwd: props.name,
            force: props.shadcn?.force,
            silent: props.shadcn?.silent,
          });
        }
      }

      async function installTanstack() {
        await exec(`bun add @tanstack/react-router`);
        await exec(
          `bun add -D @tanstack/router-plugin @tanstack/react-router-devtools`,
        );

        const src = path.join(props.name, "src");
        const routes = path.join(src, "routes");
        await fs.mkdir(routes, { recursive: true });
        await fs.writeFile(
          path.join(routes, "__root.tsx"),
          `import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
  component: () => (
    <div className="w-full min-h-screen flex flex-col">
      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{" "}
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </div>
  ),
});
`,
        );

        await fs.writeFile(
          path.join(routes, "index.tsx"),
          `import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}`,
        );

        await fs.writeFile(
          path.join(routes, "about.tsx"),
          `import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/about')({
  component: About,
})

function About() {
  return <div className="p-2">Hello from About!</div>
}`,
        );

        await fs.writeFile(
          path.join(src, "main.tsx"),
          `import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import './index.css'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}`,
        );
      }

      async function removeUnnecessaryFiles() {
        await Promise.all([
          rm(path.join(props.name, "src", "App.tsx")),
          rm(path.join(props.name, "src", "App.css")),
        ]);
      }

      async function patchTsConfig() {
        await Promise.all([
          rm(path.join(props.name, "tsconfig.app.json")),
          rm(path.join(props.name, "tsconfig.node.json")),
          fs.writeFile(
            path.join(props.name, "tsconfig.json"),
            JSON.stringify(
              {
                extends: props.extends,
                compilerOptions: {
                  baseUrl: ".",
                  paths: {
                    "@/*": ["./src/*"],
                  },
                  types: ["@cloudflare/workers-types"],
                  allowImportingTsExtensions: true,
                  jsx: "react-jsx",
                },
                include: [
                  "vite/*.ts",
                  "src/**/*.ts",
                  "src/**/*.tsx",
                  "src/env.d.ts",
                ],
                references: props.references?.map((path) => ({ path })),
              },
              null,
              2,
            ),
          ),
        ]);
      }
    }
  },
);
