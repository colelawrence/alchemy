import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { Context } from "../context";
import { Resource } from "../resource";

const execAsync = promisify(exec);

export interface ShadcnComponentProps {
  /**
   * The name of the component to install
   */
  name: string;

  /**
   * The working directory where the component should be installed
   */
  cwd: string;

  /**
   * Force overwrite of existing component
   * @default false
   */
  force?: boolean;

  /**
   * Mute output
   * @default false
   */
  silent?: boolean;
}

export interface ShadcnComponent extends ShadcnComponentProps, Resource {
  /**
   * The name of the installed component
   */
  name: string;
}

export const ShadcnComponent = Resource(
  "project::ShadcnComponent",
  async function (
    this: Context<ShadcnComponent>,
    id: string,
    props: ShadcnComponentProps,
  ): Promise<ShadcnComponent> {
    if (this.phase === "delete") {
      const componentPath = path.join(
        props.cwd,
        "src",
        "components",
        "ui",
        `${props.name}.tsx`,
      );
      try {
        await fs.unlink(componentPath);
      } catch (error) {
        if ((error as any).code !== "ENOENT") {
          throw error;
        }
      }
      return this.destroy();
    }

    // Build the shadcn add command with options
    const addCommand = [
      "bunx --bun shadcn@latest add",
      props.name,
      props.silent && "-s",
    ]
      .filter(Boolean)
      .join(" ");

    // Execute the command in the specified directory
    await execAsync(addCommand, { cwd: props.cwd });

    return this(props);
  },
);
