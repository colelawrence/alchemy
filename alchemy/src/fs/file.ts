import fs from "node:fs";
import path from "node:path";
import type { Context } from "../context";
import { Resource } from "../resource";
import { ignore } from "../util/ignore";

import { alchemy } from "../alchemy";
import type { FileCollection } from "./file-collection";
import type { FileRef } from "./file-ref";

declare module "../alchemy" {
  interface Alchemy {
    /**
     * Creates a reference to a file in the filesystem.
     * Used in template string interpolation to include file contents,
     * commonly for documentation generation.
     *
     * @param path Path to the file
     * @returns Promise resolving to a FileRef
     *
     * @example
     * // Include a file in documentation generation
     * await Document("api-docs", {
     *   prompt: await alchemy`
     *     Generate docs using the contents of:
     *     ${alchemy.file("./README.md")}
     *   `
     * });
     */
    file(path: string): Promise<FileRef>;

    /**
     * Creates a collection of files with their contents.
     * Used in template string interpolation to include multiple file contents,
     * commonly for bulk documentation generation.
     *
     * @param paths Array of file paths to include in collection
     * @returns Promise resolving to a FileCollection
     *
     * @example
     * // Include multiple source files in documentation generation
     * await Document("provider-docs", {
     *   prompt: await alchemy`
     *     Generate comprehensive docs for these files:
     *     ${alchemy.files([
     *       "src/types.ts",
     *       "src/resource.ts",
     *       "src/provider.ts"
     *     ])}
     *   `
     * });
     */
    files(paths: string[]): Promise<FileCollection>;
    files(path: string, ...paths: string[]): Promise<FileCollection>;
  }
}

alchemy.file = async (path: string) => ({
  kind: "fs::FileRef",
  path,
});

alchemy.files = async (
  ...args: [paths: string[]] | [...paths: string[]]
): Promise<FileCollection> => {
  const paths: string[] =
    typeof args[0] === "string" ? (args as string[]) : args[0];
  return {
    type: "fs::FileCollection",
    files: Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [
          path,
          await fs.promises.readFile(path, "utf-8"),
        ]),
      ),
    ),
  };
};

/**
 * Base file resource type
 */
export interface File extends Resource<"fs::File"> {
  /**
   * Path to the file
   */
  path: string;
  /**
   * Content of the file
   */
  content: string;
}

/**
 * File Resource
 *
 * Creates and manages files in the filesystem with automatic directory creation
 * and proper cleanup on deletion.
 *
 * @example
 * // Create a simple text file
 * const config = await File("config.txt", {
 *   path: "config.txt",
 *   content: "some configuration data"
 * });
 *
 * @example
 * // Create a file in a nested directory
 * const log = await File("logs/app.log", {
 *   path: "logs/app.log",
 *   content: "application log entry"
 * });
 */
export const File = Resource(
  "fs::File",
  async function (
    this: Context<File>,
    id: string,
    props: {
      path: string;
      content: string;
    },
  ): Promise<File> {
    const filePath = props?.path ?? id;
    if (this.phase === "delete") {
      await ignore("ENOENT", async () => fs.promises.unlink(filePath));
      return this.destroy();
    } else {
      await fs.promises.mkdir(path.dirname(filePath), {
        recursive: true,
      });
      await fs.promises.writeFile(filePath, props.content);
    }
    return this({
      path: filePath,
      content: props.content,
    });
  },
);
