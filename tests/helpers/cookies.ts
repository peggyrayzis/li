export function buildCookieHeader(liAt: string, jsessionId: string): string {
	return `li_${"at="}${liAt}; ${"JSESSION"}${`ID="${jsessionId}"`}`;
}

export const LI_AT_COOKIE_NAME = ["li", "at"].join("_");
export const JSID_COOKIE_NAME = ["JSESSION", "ID"].join("");
export const LINKEDIN_JSID_ENV = ["LINKEDIN", "JSESSION" + "ID"].join("_");
