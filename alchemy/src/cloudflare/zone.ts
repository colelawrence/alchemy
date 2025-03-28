import type { Context } from "../context";
import { Resource } from "../resource";
import { createCloudflareApi } from "./api";
import type {
  AlwaysUseHTTPSValue,
  AutomaticHTTPSRewritesValue,
  BrotliValue,
  CloudflareZoneSettingResponse,
  DevelopmentModeValue,
  EarlyHintsValue,
  EmailObfuscationValue,
  HTTP2Value,
  HTTP3Value,
  HotlinkProtectionValue,
  IPv6Value,
  MinTLSVersionValue,
  SSLValue,
  TLS13Value,
  UpdateZoneSettingParams,
  WebSocketsValue,
  ZeroRTTValue,
} from "./zone-settings";

/**
 * Properties for creating or updating a Zone
 */
export interface ZoneProps {
  /**
   * The domain name for the zone
   */
  name: string;

  /**
   * Account ID to use for the zone
   * If not provided, will use the default account
   */
  accountId?: string;

  /**
   * The type of zone to create
   * "full" - Full zone implies that DNS is hosted with Cloudflare
   * "partial" - Partial zone is typically a partner-hosted zone or a CNAME setup
   * "secondary" - Secondary zone is a zone that mirrors the primary zone
   * @default "full"
   */
  type?: "full" | "partial" | "secondary";

  /**
   * Whether to jump start the zone
   * When enabled, Cloudflare will attempt to fetch existing DNS records
   * @default true
   */
  jumpStart?: boolean;

  /**
   * Settings to apply to the zone
   */
  settings?: {
    /**
     * Enable SSL/TLS encryption for the zone
     * "off" - SSL disabled
     * "flexible" - Encrypts traffic between browser and Cloudflare
     * "full" - Encrypts traffic between browser and server, allows self-signed certs
     * "strict" - Encrypts traffic between browser and server, requires valid cert
     */
    ssl?: SSLValue;

    /**
     * Enable Always Use HTTPS
     * Redirects all HTTP traffic to HTTPS
     * @default "off"
     */
    alwaysUseHttps?: AlwaysUseHTTPSValue;

    /**
     * Enable Automatic HTTPS Rewrites
     * Automatically rewrites HTTP URLs to HTTPS
     * @default "off"
     */
    automaticHttpsRewrites?: AutomaticHTTPSRewritesValue;

    /**
     * Enable TLS 1.3
     * Enables the latest version of TLS encryption
     * @default "off"
     */
    tls13?: TLS13Value;

    /**
     * Enable Early Hints
     * Speeds up page loads by serving Link headers
     * @default "off"
     */
    earlyHints?: EarlyHintsValue;

    /**
     * Enable Email Obfuscation
     * Obfuscates email addresses on the site
     * @default "off"
     */
    emailObfuscation?: EmailObfuscationValue;

    /**
     * Enable Browser Cache TTL
     * Sets the browser cache TTL in seconds
     */
    browserCacheTtl?: number;

    /**
     * Enable Development Mode
     * Disables caching and enables real-time updates
     * @default "off"
     */
    developmentMode?: DevelopmentModeValue;

    /**
     * Enable HTTP/2
     * @default "on"
     */
    http2?: HTTP2Value;

    /**
     * Enable HTTP/3
     * @default "on"
     */
    http3?: HTTP3Value;

    /**
     * Enable IPv6
     * @default "on"
     */
    ipv6?: IPv6Value;

    /**
     * Enable WebSockets
     * @default "on"
     */
    websockets?: WebSocketsValue;

    /**
     * Enable Zero-RTT
     * @default "off"
     */
    zeroRtt?: ZeroRTTValue;

    /**
     * Enable Brotli compression
     * @default "on"
     */
    brotli?: BrotliValue;

    /**
     * Enable Hotlink Protection
     * @default "off"
     */
    hotlinkProtection?: HotlinkProtectionValue;

    /**
     * Minimum TLS Version
     * @default "1.0"
     */
    minTlsVersion?: MinTLSVersionValue;
  };
}

/**
 * Output returned after Zone creation/update
 */
export interface Zone extends Resource<"cloudflare::Zone"> {
  /**
   * The ID of the zone
   */
  id: string;

  /**
   * The domain name for the zone
   */
  name: string;

  /**
   * The type of zone
   */
  type: "full" | "partial" | "secondary";

  /**
   * The status of the zone
   */
  status: string;

  /**
   * Whether the zone is paused
   */
  paused: boolean;

  /**
   * The account ID the zone belongs to
   */
  accountId: string;

  /**
   * The nameservers assigned to the zone
   */
  nameservers: string[];

  /**
   * The original nameservers for the zone
   */
  originalNameservers: string[] | null;

  /**
   * Time at which the zone was created
   */
  createdAt: number;

  /**
   * Time at which the zone was last modified
   */
  modifiedAt: number;

  /**
   * Time at which the zone was activated
   */
  activatedAt: number | null;

  /**
   * The zone's current settings
   */
  settings: {
    ssl: SSLValue;
    alwaysUseHttps: AlwaysUseHTTPSValue;
    automaticHttpsRewrites: AutomaticHTTPSRewritesValue;
    tls13: TLS13Value;
    earlyHints: EarlyHintsValue;
    emailObfuscation: EmailObfuscationValue;
    browserCacheTtl: number;
    developmentMode: DevelopmentModeValue;
    http2: HTTP2Value;
    http3: HTTP3Value;
    ipv6: IPv6Value;
    websockets: WebSocketsValue;
    zeroRtt: ZeroRTTValue;
    brotli: BrotliValue;
    hotlinkProtection: HotlinkProtectionValue;
    minTlsVersion: MinTLSVersionValue;
  };
}

export const Zone = Resource(
  "cloudflare::Zone",
  async function (
    this: Context<Zone>,
    id: string,
    props: ZoneProps,
  ): Promise<Zone> {
    // Create Cloudflare API client with automatic account discovery
    const api = await createCloudflareApi({
      accountId: props.accountId,
    });

    if (this.phase === "delete") {
      if (this.output?.id) {
        // Delete zone
        const deleteResponse = await api.delete(`/zones/${this.output.id}`);

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          const errorData: any = await deleteResponse.json().catch(() => ({
            errors: [{ message: deleteResponse.statusText }],
          }));
          throw new Error(
            `Error deleting zone '${props.name}': ${errorData.errors?.[0]?.message || deleteResponse.statusText}`,
          );
        }
      } else {
        console.warn(`Zone '${props.name}' not found, skipping delete`);
      }
      return this.destroy();
    }

    if (this.phase === "update" && this.output?.id) {
      // Get zone details to verify it exists
      const response = await api.get(`/zones/${this.output.id}`);

      if (!response.ok) {
        throw new Error(
          `Error getting zone '${props.name}': ${response.statusText}`,
        );
      }

      const result = (await response.json()) as CloudflareZoneResponse;
      const zoneData = result.result;

      // Update zone settings if provided
      if (props.settings) {
        await updateZoneSettings(api, this.output.id, props.settings);
        // Add a small delay to ensure settings are propagated
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return this({
        id: zoneData.id,
        name: zoneData.name,
        type: zoneData.type,
        status: zoneData.status,
        paused: zoneData.paused,
        accountId: zoneData.account.id,
        nameservers: zoneData.name_servers,
        originalNameservers: zoneData.original_name_servers,
        createdAt: new Date(zoneData.created_on).getTime(),
        modifiedAt: new Date(zoneData.modified_on).getTime(),
        activatedAt: zoneData.activated_on
          ? new Date(zoneData.activated_on).getTime()
          : null,
        settings: await getZoneSettings(api, zoneData.id),
      });
    } else {
      // Create new zone

      const response = await api.post("/zones", {
        name: props.name,
        type: props.type || "full",
        jump_start: props.jumpStart !== false,
        account: {
          id: api.accountId,
        },
      });

      const body = await response.text();
      if (!response.ok) {
        if (response.status === 400 && body.includes("already exists")) {
          // TODO: should we error?
        } else {
          throw new Error(
            `Error creating zone '${props.name}': ${response.statusText}\n${body}`,
          );
        }
      }

      const zoneData = (JSON.parse(body) as CloudflareZoneResponse).result;

      // Update zone settings if provided
      if (props.settings) {
        await updateZoneSettings(api, zoneData.id, props.settings);
        // Add a small delay to ensure settings are propagated
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return this({
        id: zoneData.id,
        name: zoneData.name,
        type: zoneData.type,
        status: zoneData.status,
        paused: zoneData.paused,
        accountId: zoneData.account.id,
        nameservers: zoneData.name_servers,
        originalNameservers: zoneData.original_name_servers,
        createdAt: new Date(zoneData.created_on).getTime(),
        modifiedAt: new Date(zoneData.modified_on).getTime(),
        activatedAt: zoneData.activated_on
          ? new Date(zoneData.activated_on).getTime()
          : null,
        settings: await getZoneSettings(api, zoneData.id),
      });
    }
  },
);

/**
 * Helper function to update zone settings
 */
async function updateZoneSettings(
  api: any,
  zoneId: string,
  settings: ZoneProps["settings"],
): Promise<void> {
  if (!settings) return;

  const settingsMap = {
    ssl: "ssl",
    alwaysUseHttps: "always_use_https",
    automaticHttpsRewrites: "automatic_https_rewrites",
    tls13: "tls_1_3",
    earlyHints: "early_hints",
    emailObfuscation: "email_obfuscation",
    browserCacheTtl: "browser_cache_ttl",
    developmentMode: "development_mode",
    http2: "http2",
    http3: "http3",
    ipv6: "ipv6",
    websockets: "websockets",
    zeroRtt: "0rtt",
    brotli: "brotli",
    hotlinkProtection: "hotlink_protection",
    minTlsVersion: "min_tls_version",
  };

  await Promise.all(
    Object.entries(settings)
      .filter(([_, value]) => value !== undefined)
      .map(async ([key, value]) => {
        const settingId = settingsMap[key as keyof typeof settings];
        if (!settingId) return;

        const response = await api.patch(
          `/zones/${zoneId}/settings/${settingId}`,
          {
            value,
          } as UpdateZoneSettingParams,
        );

        if (!response.ok) {
          const data = await response.text();
          if (response.status === 400 && data.includes("already enabled")) {
            console.warn(`Warning: Setting '${key}' already enabled`);
            return;
          }
          throw new Error(
            `Failed to update zone setting ${key}: ${response.statusText}`,
          );
        }
      }),
  );
}

/**
 * Helper function to get current zone settings
 */
async function getZoneSettings(
  api: any,
  zoneId: string,
): Promise<Zone["settings"]> {
  const settingsResponse = await api.get(`/zones/${zoneId}/settings`);

  if (!settingsResponse.ok) {
    throw new Error(
      `Failed to fetch zone settings: ${settingsResponse.status} ${settingsResponse.statusText}`,
    );
  }

  const result =
    (await settingsResponse.json()) as CloudflareZoneSettingResponse;
  const settingsData = result.result;

  // Helper to get setting value with default
  const getSetting = <T>(id: string, defaultValue: T): T => {
    const setting = settingsData.find((s: any) => s.id === id);
    return (setting?.value as T) ?? defaultValue;
  };

  return {
    ssl: getSetting("ssl", "off"),
    alwaysUseHttps: getSetting("always_use_https", "off"),
    automaticHttpsRewrites: getSetting("automatic_https_rewrites", "off"),
    tls13: getSetting("tls_1_3", "off"),
    earlyHints: getSetting("early_hints", "off"),
    emailObfuscation: getSetting("email_obfuscation", "off"),
    browserCacheTtl: getSetting("browser_cache_ttl", 14400),
    developmentMode: getSetting("development_mode", "off"),
    http2: getSetting("http2", "on"),
    http3: getSetting("http3", "on"),
    ipv6: getSetting("ipv6", "on"),
    websockets: getSetting("websockets", "on"),
    zeroRtt: getSetting("0rtt", "off"),
    brotli: getSetting("brotli", "on"),
    hotlinkProtection: getSetting("hotlink_protection", "off"),
    minTlsVersion: getSetting("min_tls_version", "1.0"),
  };
}

/**
 * Cloudflare Zone API response
 */
interface CloudflareZoneResponse {
  result: {
    id: string;
    name: string;
    type: "full" | "partial" | "secondary";
    status: string;
    paused: boolean;
    account: {
      id: string;
    };
    name_servers: string[];
    original_name_servers: string[] | null;
    created_on: string;
    modified_on: string;
    activated_on: string | null;
  };
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}
