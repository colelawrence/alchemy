import {
  CreateRoleCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  EntityAlreadyExistsException,
  GetRoleCommand,
  IAMClient,
  NoSuchEntityException,
  PutRolePolicyCommand,
  type Tag,
  TagRoleCommand,
  UpdateAssumeRolePolicyCommand,
  UpdateRoleCommand,
} from "@aws-sdk/client-iam";
import { ignore } from "../error";
import { type Context, Resource } from "../resource";
import type { PolicyDocument } from "./policy";

export interface RoleInput {
  roleName: string;
  assumeRolePolicy: PolicyDocument;
  description?: string;
  path?: string;
  maxSessionDuration?: number;
  permissionsBoundary?: string;
  policies?: Array<{
    policyName: string;
    policyDocument: PolicyDocument;
  }>;
  managedPolicyArns?: string[];
  tags?: Record<string, string>;
}

export interface RoleOutput extends RoleInput {
  id: string; // Same as roleName
  arn: string;
  uniqueId: string; // Unique identifier for the role
  roleId: string; // The stable and unique string identifying the role
  createDate: Date;
}

export class Role extends Resource(
  "aws.iam.Role",
  async (
    ctx: Context<RoleInput, RoleOutput>,
    props: RoleInput,
  ): Promise<RoleOutput> => {
    const client = new IAMClient({});

    if (ctx.event === "delete") {
      // Delete any inline policies first
      if (props.policies) {
        for (const policy of props.policies) {
          await ignore(NoSuchEntityException.name, () =>
            client.send(
              new DeleteRolePolicyCommand({
                RoleName: props.roleName,
                PolicyName: policy.policyName,
              }),
            ),
          );
        }
      }

      await ignore(NoSuchEntityException.name, () =>
        client.send(
          new DeleteRoleCommand({
            RoleName: props.roleName,
          }),
        ),
      );
      return {
        ...props,
        id: props.roleName,
        arn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/${props.roleName}`,
        uniqueId: "",
        roleId: "",
        createDate: new Date(),
      };
    }

    const assumeRolePolicyDocument = JSON.stringify(props.assumeRolePolicy);
    let role;

    try {
      if (ctx.event === "create") {
        // Try to create the role
        await client.send(
          new CreateRoleCommand({
            RoleName: props.roleName,
            AssumeRolePolicyDocument: assumeRolePolicyDocument,
            Description: props.description,
            Path: props.path,
            MaxSessionDuration: props.maxSessionDuration,
            PermissionsBoundary: props.permissionsBoundary,
            Tags: [
              ...Object.entries(props.tags || {}).map(([Key, Value]) => ({
                Key,
                Value,
              })),
              {
                Key: "alchemy_stage",
                Value: ctx.stage,
              },
              {
                Key: "alchemy_resource",
                Value: ctx.resourceID,
              },
            ],
          }),
        );
      }
    } catch (error: any) {
      if (
        error instanceof EntityAlreadyExistsException &&
        ctx.event === "create"
      ) {
        // Check if we were the ones who created it
        const existingRole = await client.send(
          new GetRoleCommand({
            RoleName: props.roleName,
          }),
        );
        const roleTags =
          existingRole.Role?.Tags?.reduce(
            (acc, tag) => {
              acc[tag.Key!] = tag.Value!;
              return acc;
            },
            {} as Record<string, string>,
          ) || {};

        if (
          roleTags.alchemy_stage !== ctx.stage ||
          roleTags.alchemy_resource !== ctx.resourceID
        ) {
          throw error;
        }
      } else if (error.name !== NoSuchEntityException.name) {
        throw error;
      }
    }

    // Get or update the role
    role = await client.send(
      new GetRoleCommand({
        RoleName: props.roleName,
      }),
    );

    // Update assume role policy if it changed
    if (role.Role?.AssumeRolePolicyDocument !== assumeRolePolicyDocument) {
      await client.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: props.roleName,
          PolicyDocument: assumeRolePolicyDocument,
        }),
      );
    }

    // Update role description and max session duration if they changed
    if (
      role.Role?.Description !== props.description ||
      role.Role?.MaxSessionDuration !== props.maxSessionDuration
    ) {
      await client.send(
        new UpdateRoleCommand({
          RoleName: props.roleName,
          Description: props.description,
          MaxSessionDuration: props.maxSessionDuration,
        }),
      );
    }

    // Update tags
    const newTags = {
      ...props.tags,
      alchemy_stage: ctx.stage,
      alchemy_resource: ctx.resourceID,
    };
    const tags: Tag[] = Object.entries(newTags).map(([Key, Value]) => ({
      Key,
      Value,
    }));
    await client.send(
      new TagRoleCommand({
        RoleName: props.roleName,
        Tags: tags,
      }),
    );

    // Handle policy changes
    const previousPolicies =
      ctx.event === "update" ? ctx.output.policies || [] : [];
    const currentPolicies = props.policies || [];

    // Delete policies that were removed
    for (const oldPolicy of previousPolicies) {
      if (
        !currentPolicies.some(
          (p: { policyName: string }) => p.policyName === oldPolicy.policyName,
        )
      ) {
        await ignore(NoSuchEntityException.name, () =>
          client.send(
            new DeleteRolePolicyCommand({
              RoleName: props.roleName,
              PolicyName: oldPolicy.policyName,
            }),
          ),
        );
      }
    }

    // Update or create policies
    for (const policy of currentPolicies) {
      const oldPolicy = previousPolicies.find(
        (p) => p.policyName === policy.policyName,
      );
      if (
        !oldPolicy ||
        JSON.stringify(oldPolicy.policyDocument) !==
          JSON.stringify(policy.policyDocument)
      ) {
        await client.send(
          new PutRolePolicyCommand({
            RoleName: props.roleName,
            PolicyName: policy.policyName,
            PolicyDocument: JSON.stringify(policy.policyDocument),
          }),
        );
      }
    }

    if (!role?.Role) {
      throw new Error(`Failed to create or update role ${props.roleName}`);
    }

    return {
      ...props,
      id: props.roleName,
      arn: role.Role.Arn!,
      uniqueId: role.Role.RoleId!,
      roleId: role.Role.RoleId!,
      createDate: role.Role.CreateDate!,
    };
  },
) {}
