import { Output } from "./output";
import {
  Input,
  Provider,
  ResourceID,
  isResource,
  type Resource,
} from "./resource";

/**
 * Apply a sub-graph to produce a resource.
 * @param output A sub-graph that produces a resource.
 * @returns The resource properties.
 */
export async function apply<T>(output: T | Output<T>): Promise<T> {
  return (await evaluate(output)).value;
}

class Evaluated<T> {
  constructor(
    public readonly value: T,
    public readonly deps: string[] = [],
  ) {}
}

const cache = new WeakMap<Resource, Promise<Evaluated<any>>>();

export async function evaluate<T>(
  output: T | Output<T>,
): Promise<Evaluated<T>> {
  if (isResource(output)) {
    const resource = output;
    const resourceID = resource[ResourceID];
    const evaluated = await Promise.all(resource[Input].map(evaluate<any>));

    if (cache.has(resource)) {
      return await cache.get(resource)!;
    }
    let resolve: (value: Evaluated<any>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<Evaluated<any>>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // set this eagerly to avoid double-apply (caused by recursive applies to inputs)
    cache.set(resource, promise);

    const deps = new Set(evaluated.flatMap((input) => input.deps));
    const inputs = evaluated.map((input) => input.value);
    try {
      const result: T = await resource[Provider].update(
        resource,
        deps,
        inputs as [],
      );
      resolve!(new Evaluated(result, [resourceID, ...deps]));
    } catch (error) {
      reject!(error);
    }
    return promise;
  } else if (output instanceof Output) {
    const inside = output as unknown as {
      parent: Output<any>;
      fn: (value: any) => T;
    };
    const parent = await evaluate(inside.parent);
    const ret = inside.fn(parent.value);
    // the ret may be an Output (e.g. in the flatMap case), so we need to evaluate it and include its deps
    const evaluated = await evaluate(ret);
    return new Evaluated<T>(evaluated.value, [
      ...parent.deps,
      ...evaluated.deps,
    ]);
  } else if (Array.isArray(output)) {
    const evaluatedItems = await Promise.all(
      output.map((item) => evaluate(item)),
    );
    return new Evaluated(
      evaluatedItems.map((e) => e.value) as unknown as T,
      evaluatedItems.flatMap((e) => e.deps),
    );
  } else if (output && typeof output === "object") {
    const entries = Object.entries(output);
    const evaluatedEntries = await Promise.all(
      entries.map(
        async ([key, value]) => [key, await evaluate(value)] as const,
      ),
    );

    const result = Object.fromEntries(
      evaluatedEntries.map(([key, evaluated]) => [key, evaluated.value]),
    ) as unknown as T;

    const deps = evaluatedEntries.flatMap(([_, evaluated]) => evaluated.deps);

    return new Evaluated(result, deps);
  }

  // Base case: primitive value
  return new Evaluated<T>(output as T);
}
