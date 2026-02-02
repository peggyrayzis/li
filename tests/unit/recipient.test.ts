/**
 * Tests for the recipient resolution utility.
 *
 * Tests the shared resolveRecipient() function which handles:
 * - Plain usernames (e.g., "peggyrayzis")
 * - Profile URLs (e.g., "https://linkedin.com/in/peggyrayzis")
 * - Profile URNs (e.g., "urn:li:fsd_profile:ACoAABcd1234")
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedInClient } from "../../src/lib/client.js";
import { resolveRecipient } from "../../src/lib/recipient.js";

// Mock the LinkedInClient
vi.mock("../../src/lib/client.js", () => {
	return {
		LinkedInClient: vi.fn(),
	};
});

describe("recipient", () => {
	let mockClient: { request: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		mockClient = {
			request: vi.fn(),
		};
		vi.mocked(LinkedInClient).mockImplementation(() => mockClient as unknown as LinkedInClient);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("resolveRecipient", () => {
		describe("plain username input", () => {
			it("resolves a plain username to profile URN", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
									publicIdentifier: "peggyrayzis",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"peggyrayzis",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
				expect(mockClient.request).toHaveBeenCalledWith(
					"/identity/dash/profiles?q=memberIdentity&memberIdentity=peggyrayzis",
					{ method: "GET" },
				);
			});

			it("trims whitespace from username", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
									publicIdentifier: "peggyrayzis",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"  peggyrayzis  ",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
			});

			it("throws error when profile not found for username", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () => Promise.resolve({ elements: [] }),
				});

				await expect(
					resolveRecipient(mockClient as unknown as LinkedInClient, "unknownuser"),
				).rejects.toThrow("Profile not found: unknownuser");
			});
		});

		describe("profile URL input", () => {
			it("resolves a profile URL to profile URN", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
									publicIdentifier: "peggyrayzis",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"https://www.linkedin.com/in/peggyrayzis",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
			});

			it("resolves a profile URL with trailing slash", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
									publicIdentifier: "peggyrayzis",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"https://www.linkedin.com/in/peggyrayzis/",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
			});

			it("resolves a mobile profile URL", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
									publicIdentifier: "peggyrayzis",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"https://m.linkedin.com/in/peggyrayzis",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
			});
		});

		describe("profile URN input", () => {
			it("resolves an fsd_profile URN by looking up the profile", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
									publicIdentifier: "peggyrayzis",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"urn:li:fsd_profile:ACoAABcd1234",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
				expect(mockClient.request).toHaveBeenCalledWith(
					"/identity/dash/profiles?q=memberIdentity&memberIdentity=urn%3Ali%3Afsd_profile%3AACoAABcd1234",
					{ method: "GET" },
				);
			});

			it("resolves a member URN by looking up the profile", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:member:123456789",
									publicIdentifier: "johndoe",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"urn:li:member:123456789",
				);

				expect(result).toEqual({
					username: "johndoe",
					urn: "urn:li:member:123456789",
				});
			});

			it("throws error when profile not found for URN", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () => Promise.resolve({ elements: [] }),
				});

				await expect(
					resolveRecipient(mockClient as unknown as LinkedInClient, "urn:li:fsd_profile:unknown"),
				).rejects.toThrow("Profile not found for URN: urn:li:fsd_profile:unknown");
			});
		});

		describe("invalid inputs", () => {
			it("throws error for empty string", async () => {
				await expect(resolveRecipient(mockClient as unknown as LinkedInClient, "")).rejects.toThrow(
					"Invalid input: identifier is required",
				);
			});

			it("throws error for whitespace-only string", async () => {
				await expect(
					resolveRecipient(mockClient as unknown as LinkedInClient, "   "),
				).rejects.toThrow("Invalid input: identifier is required");
			});

			it("throws error for non-profile URL (company)", async () => {
				await expect(
					resolveRecipient(
						mockClient as unknown as LinkedInClient,
						"https://www.linkedin.com/company/anthropic",
					),
				).rejects.toThrow("Invalid input: cannot resolve company URL to a profile");
			});

			it("throws error for non-profile URL (job)", async () => {
				await expect(
					resolveRecipient(
						mockClient as unknown as LinkedInClient,
						"https://www.linkedin.com/jobs/view/123456",
					),
				).rejects.toThrow("Invalid input: cannot resolve job URL to a profile");
			});

			it("throws error for post URL", async () => {
				await expect(
					resolveRecipient(
						mockClient as unknown as LinkedInClient,
						"https://www.linkedin.com/feed/update/urn:li:activity:7294184927465283584",
					),
				).rejects.toThrow("Invalid input: cannot resolve post URL to a profile");
			});

			it("throws error for non-LinkedIn URL", async () => {
				await expect(
					resolveRecipient(
						mockClient as unknown as LinkedInClient,
						"https://twitter.com/peggyrayzis",
					),
				).rejects.toThrow(
					"Invalid input: https://twitter.com/peggyrayzis is not a valid LinkedIn profile",
				);
			});
		});

		describe("edge cases", () => {
			it("handles response without publicIdentifier", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () =>
						Promise.resolve({
							elements: [
								{
									entityUrn: "urn:li:fsd_profile:ACoAABcd1234",
								},
							],
						}),
				});

				const result = await resolveRecipient(
					mockClient as unknown as LinkedInClient,
					"peggyrayzis",
				);

				expect(result).toEqual({
					username: "peggyrayzis",
					urn: "urn:li:fsd_profile:ACoAABcd1234",
				});
			});

			it("handles response with null elements", async () => {
				mockClient.request.mockResolvedValueOnce({
					json: () => Promise.resolve({ elements: null }),
				});

				await expect(
					resolveRecipient(mockClient as unknown as LinkedInClient, "unknownuser"),
				).rejects.toThrow("Profile not found: unknownuser");
			});
		});
	});
});
