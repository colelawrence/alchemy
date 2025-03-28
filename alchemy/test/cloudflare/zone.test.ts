import { describe, expect } from "bun:test";
import { alchemy } from "../../src/alchemy";
import { createCloudflareApi } from "../../src/cloudflare/api";
import { Zone } from "../../src/cloudflare/zone";
import { destroy } from "../../src/destroy";
import "../../src/test/bun";
import { BRANCH_PREFIX } from "../util";

const api = await createCloudflareApi();

const test = alchemy.test(import.meta);

describe("Zone Resource", () => {
  // Use BRANCH_PREFIX for deterministic, non-colliding zone names
  const testDomain = `${BRANCH_PREFIX}-test.dev`;

  test("create, update, and delete zone with all settings", async (scope) => {
    let zone: Zone | undefined;
    try {
      // Create a test zone with initial settings
      zone = await Zone(testDomain, {
        name: testDomain,
        type: "full",
        jumpStart: false,
        settings: {
          // Security settings
          ssl: "flexible",
          alwaysUseHttps: "on",
          automaticHttpsRewrites: "on",
          minTlsVersion: "1.2",
          tls13: "zrt",

          // Performance settings
          browserCacheTtl: 7200,
          brotli: "on",
          zeroRtt: "on",

          // Feature settings
          ipv6: "on",
          websockets: "on",
          earlyHints: "on",
          emailObfuscation: "on",
          hotlinkProtection: "on",
          developmentMode: "off",
        },
      });

      expect(zone.id).toBeTruthy();
      expect(zone.name).toEqual(testDomain);
      expect(zone.type).toEqual("full");

      // Verify security settings
      expect(zone.settings.ssl).toEqual("flexible");
      expect(zone.settings.alwaysUseHttps).toEqual("on");
      expect(zone.settings.automaticHttpsRewrites).toEqual("on");
      expect(zone.settings.minTlsVersion).toEqual("1.2");
      expect(zone.settings.tls13).toEqual("zrt");

      // Verify performance settings
      expect(zone.settings.browserCacheTtl).toEqual(7200);
      expect(zone.settings.brotli).toEqual("on");
      expect(zone.settings.zeroRtt).toEqual("on");

      // Verify feature settings
      expect(zone.settings.ipv6).toEqual("on");
      expect(zone.settings.websockets).toEqual("on");
      expect(zone.settings.earlyHints).toEqual("on");
      expect(zone.settings.emailObfuscation).toEqual("on");
      expect(zone.settings.hotlinkProtection).toEqual("on");
      expect(zone.settings.developmentMode).toEqual("off");

      // Verify zone was created by querying the API directly
      const getResponse = await api.get(`/zones/${zone.id}`);
      expect(getResponse.status).toEqual(200);

      const responseData = await getResponse.json();
      expect(responseData.result.name).toEqual(testDomain);

      // Update the zone with different settings
      zone = await Zone(testDomain, {
        name: testDomain,
        settings: {
          // Change security settings
          ssl: "strict",
          minTlsVersion: "1.3",

          // Change performance settings
          browserCacheTtl: 14400,
          zeroRtt: "off",

          // Change feature settings
          hotlinkProtection: "off",
          developmentMode: "on",
        },
      });

      expect(zone.id).toBeTruthy();

      // Verify updated security settings
      expect(zone.settings.ssl).toEqual("strict");
      expect(zone.settings.minTlsVersion).toEqual("1.3");

      // Verify updated performance settings
      expect(zone.settings.browserCacheTtl).toEqual(14400);
      expect(zone.settings.zeroRtt).toEqual("off");

      // Verify updated feature settings
      expect(zone.settings.hotlinkProtection).toEqual("off");
      expect(zone.settings.developmentMode).toEqual("on");

      // Verify unchanged settings remain the same
      expect(zone.settings.alwaysUseHttps).toEqual("on");
      expect(zone.settings.ipv6).toEqual("on");

      // Verify settings were updated in the API
      const settingsResponse = await api.get(`/zones/${zone.id}/settings`);
      const settingsData = await settingsResponse.json();

      // Helper function to find setting value
      const getSetting = (id: string) =>
        settingsData.result.find((s: any) => s.id === id)?.value;

      // Verify security settings in API
      expect(getSetting("ssl")).toEqual("strict");
      expect(getSetting("min_tls_version")).toEqual("1.3");
      expect(getSetting("always_use_https")).toEqual("on");

      // Verify performance settings in API
      expect(getSetting("browser_cache_ttl")).toEqual(14400);
      expect(getSetting("0rtt")).toEqual("off");
      expect(getSetting("brotli")).toEqual("on");

      // Verify feature settings in API
      expect(getSetting("hotlink_protection")).toEqual("off");
      expect(getSetting("development_mode")).toEqual("on");
      expect(getSetting("ipv6")).toEqual("on");
      expect(getSetting("websockets")).toEqual("on");
    } catch (err) {
      // log the error or else it's silently swallowed by destroy errors
      console.log(err);
      throw err;
    } finally {
      // Always clean up, even if test assertions fail
      await destroy(scope);

      if (zone) {
        const getDeletedResponse = await api.get(`/zones/${zone?.id}`);
        const text = await getDeletedResponse.text();
        expect(text).toContain("Invalid zone identifier");
        // seriously, wtf, why 400?
        expect(getDeletedResponse.status).toEqual(400);
      }
    }
  });
});
