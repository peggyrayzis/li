import { describe, expect, it } from "vitest";
import {
	type ParsedLinkedInUrl,
	extractIdFromUrn,
	parseLinkedInUrl,
} from "../../src/lib/url-parser.js";

describe("url-parser", () => {
	describe("parseLinkedInUrl", () => {
		describe("profile URLs", () => {
			it("parses /in/username format", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/in/peggyrayzis");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("parses /in/username with trailing slash", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/in/peggyrayzis/");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("parses /in/username with query params", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/in/peggyrayzis?miniProfileUrn=123",
				);

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("handles http URLs", () => {
				const result = parseLinkedInUrl("http://www.linkedin.com/in/peggyrayzis");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("handles linkedin.com without www", () => {
				const result = parseLinkedInUrl("https://linkedin.com/in/peggyrayzis");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("handles mobile linkedin URLs (m.linkedin.com)", () => {
				const result = parseLinkedInUrl("https://m.linkedin.com/in/peggyrayzis");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});
		});

		describe("post URLs - /feed/update/ format", () => {
			it("parses /feed/update/urn:li:activity:* format", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/feed/update/urn:li:activity:7294184927465283584",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:7294184927465283584",
				});
			});

			it("parses /feed/update/ with trailing slash", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/feed/update/urn:li:activity:7294184927465283584/",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:7294184927465283584",
				});
			});

			it("parses /feed/update/ with query params", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/feed/update/urn:li:activity:7294184927465283584?updateEntityUrn=foo",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:7294184927465283584",
				});
			});

			it("handles ugcPost URN type", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/feed/update/urn:li:ugcPost:7294184927465283584",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:ugcPost:7294184927465283584",
				});
			});

			it("handles share URN type", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/feed/update/urn:li:share:7294184927465283584",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:share:7294184927465283584",
				});
			});
		});

		describe("post URLs - /posts/ format", () => {
			it("parses /posts/username_slug-activity-id format", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/posts/peggyrayzis_developer-marketing-activity-7294184927465283584",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:7294184927465283584",
				});
			});

			it("parses /posts/ with trailing query params", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/posts/peggyrayzis_developer-marketing-activity-7294184927465283584?utm_source=share",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:7294184927465283584",
				});
			});

			it("parses /posts/ with complex slug containing underscores", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/posts/john-doe_some_topic_with_underscores-activity-1234567890123456789",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:1234567890123456789",
				});
			});

			it("parses /posts/ with ugcPost type", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/posts/peggyrayzis_topic-ugcPost-7294184927465283584",
				);

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:ugcPost:7294184927465283584",
				});
			});
		});

		describe("company URLs", () => {
			it("parses /company/slug format", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/company/anthropic");

				expect(result).toEqual({
					type: "company",
					identifier: "anthropic",
				});
			});

			it("parses /company/slug with trailing slash", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/company/anthropic/");

				expect(result).toEqual({
					type: "company",
					identifier: "anthropic",
				});
			});

			it("parses /company/slug with subpath", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/company/anthropic/posts");

				expect(result).toEqual({
					type: "company",
					identifier: "anthropic",
				});
			});

			it("parses /company/slug with query params", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/company/anthropic?miniCompanyUrn=123",
				);

				expect(result).toEqual({
					type: "company",
					identifier: "anthropic",
				});
			});
		});

		describe("job URLs", () => {
			it("parses /jobs/view/id format", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/jobs/view/1234567890");

				expect(result).toEqual({
					type: "job",
					identifier: "1234567890",
				});
			});

			it("parses /jobs/view/id with trailing slash", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/jobs/view/1234567890/");

				expect(result).toEqual({
					type: "job",
					identifier: "1234567890",
				});
			});

			it("parses /jobs/view/id with query params", () => {
				const result = parseLinkedInUrl(
					"https://www.linkedin.com/jobs/view/1234567890?refId=abc&trackingId=xyz",
				);

				expect(result).toEqual({
					type: "job",
					identifier: "1234567890",
				});
			});
		});

		describe("raw URNs", () => {
			it("passes through activity URN", () => {
				const result = parseLinkedInUrl("urn:li:activity:7294184927465283584");

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:activity:7294184927465283584",
				});
			});

			it("passes through ugcPost URN", () => {
				const result = parseLinkedInUrl("urn:li:ugcPost:7294184927465283584");

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:ugcPost:7294184927465283584",
				});
			});

			it("passes through share URN", () => {
				const result = parseLinkedInUrl("urn:li:share:7294184927465283584");

				expect(result).toEqual({
					type: "post",
					identifier: "urn:li:share:7294184927465283584",
				});
			});

			it("passes through member URN as profile", () => {
				const result = parseLinkedInUrl("urn:li:member:123456789");

				expect(result).toEqual({
					type: "profile",
					identifier: "urn:li:member:123456789",
				});
			});

			it("passes through fsd_profile URN as profile", () => {
				const result = parseLinkedInUrl("urn:li:fsd_profile:ACoAABcd1234");

				expect(result).toEqual({
					type: "profile",
					identifier: "urn:li:fsd_profile:ACoAABcd1234",
				});
			});

			it("passes through company URN", () => {
				const result = parseLinkedInUrl("urn:li:company:12345");

				expect(result).toEqual({
					type: "company",
					identifier: "urn:li:company:12345",
				});
			});

			it("passes through job URN", () => {
				const result = parseLinkedInUrl("urn:li:job:1234567890");

				expect(result).toEqual({
					type: "job",
					identifier: "urn:li:job:1234567890",
				});
			});
		});

		describe("plain usernames", () => {
			it("returns plain username as profile", () => {
				const result = parseLinkedInUrl("peggyrayzis");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("returns username with dashes as profile", () => {
				const result = parseLinkedInUrl("john-doe-123");

				expect(result).toEqual({
					type: "profile",
					identifier: "john-doe-123",
				});
			});
		});

		describe("invalid inputs", () => {
			it("returns null for empty string", () => {
				const result = parseLinkedInUrl("");

				expect(result).toBeNull();
			});

			it("returns null for non-LinkedIn URL", () => {
				const result = parseLinkedInUrl("https://twitter.com/peggyrayzis");

				expect(result).toBeNull();
			});

			it("returns null for LinkedIn URL with unsupported path", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/learning");

				expect(result).toBeNull();
			});

			it("returns null for malformed URN", () => {
				const result = parseLinkedInUrl("urn:li:");

				expect(result).toBeNull();
			});

			it("returns null for unsupported URN type", () => {
				const result = parseLinkedInUrl("urn:li:unknownType:12345");

				expect(result).toBeNull();
			});

			it("returns null for /posts/ URL without activity ID", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/posts/peggyrayzis");

				expect(result).toBeNull();
			});

			it("returns null for /jobs/view/ without job ID", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/jobs/view/");

				expect(result).toBeNull();
			});
		});

		describe("edge cases", () => {
			it("handles URL with fragment", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/in/peggyrayzis#experience");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});

			it("handles URL with encoded characters", () => {
				const result = parseLinkedInUrl("https://www.linkedin.com/in/john%2Ddoe");

				expect(result).toEqual({
					type: "profile",
					identifier: "john-doe",
				});
			});

			it("trims whitespace from input", () => {
				const result = parseLinkedInUrl("  peggyrayzis  ");

				expect(result).toEqual({
					type: "profile",
					identifier: "peggyrayzis",
				});
			});
		});
	});

	describe("ParsedLinkedInUrl type", () => {
		it("has correct type union", () => {
			const profile: ParsedLinkedInUrl = {
				type: "profile",
				identifier: "test",
			};
			const post: ParsedLinkedInUrl = { type: "post", identifier: "test" };
			const company: ParsedLinkedInUrl = {
				type: "company",
				identifier: "test",
			};
			const job: ParsedLinkedInUrl = { type: "job", identifier: "test" };

			expect(profile.type).toBe("profile");
			expect(post.type).toBe("post");
			expect(company.type).toBe("company");
			expect(job.type).toBe("job");
		});
	});

	describe("extractIdFromUrn", () => {
		it("extracts ID from invitation URN", () => {
			const result = extractIdFromUrn("urn:li:fsd_invitation:INV123");
			expect(result).toBe("INV123");
		});

		it("extracts ID from conversation URN", () => {
			const result = extractIdFromUrn("urn:li:conversation:123456789");
			expect(result).toBe("123456789");
		});

		it("extracts ID from profile URN", () => {
			const result = extractIdFromUrn("urn:li:fsd_profile:ACoAABcd1234");
			expect(result).toBe("ACoAABcd1234");
		});

		it("returns plain ID unchanged", () => {
			const result = extractIdFromUrn("INV123");
			expect(result).toBe("INV123");
		});

		it("handles numeric ID", () => {
			const result = extractIdFromUrn("123456");
			expect(result).toBe("123456");
		});

		it("handles URN with special characters in ID", () => {
			const result = extractIdFromUrn("urn:li:member:ACoAAA-test_123");
			expect(result).toBe("ACoAAA-test_123");
		});
	});
});
