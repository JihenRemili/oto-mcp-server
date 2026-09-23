import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

type OtoEnv = Env & {
	OTO_REFRESH_TOKEN: string;
};

async function getOtoAccessToken(env: OtoEnv): Promise<string> {
	const response = await fetch(
		"https://api.tryoto.com/rest/v2/refreshToken",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				refresh_token: env.OTO_REFRESH_TOKEN,
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`OTO authentication failed (${response.status}): ${errorText}`,
		);
	}

	const data = (await response.json()) as {
		access_token?: string;
	};

	if (!data.access_token) {
		throw new Error("OTO did not return an access_token.");
	}

	return data.access_token;
}

async function otoRequest(
	env: OtoEnv,
	path: string,
): Promise<unknown> {
	const accessToken = await getOtoAccessToken(env);

	const response = await fetch(
		`https://api.tryoto.com/rest/v2/${path}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`OTO API request failed (${response.status}): ${errorText}`,
		);
	}

	return response.json();
}

function createServer(env: OtoEnv) {
	const server = new McpServer({
		name: "OTO MCP Server",
		version: "1.2.0",
	});

	server.registerTool(
		"oto_account_info",
		{
			description:
				"Get connected OTO account information. Read-only.",
			inputSchema: z.object({}),
		},
		async () => {
			try {
				const data = await otoRequest(env, "accountInfo");

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(data, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text:
								error instanceof Error
									? error.message
									: "Unknown OTO API error",
						},
					],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"oto_orders",
		{
			description:
				"Read orders from OTO with pagination, date filters "
				+ "and status filtering. OTO currently returns older "
				+ "orders on the first page. To find the newest orders, "
				+ "check the total page count in the response, then "
				+ "request the last page and sort those orders by date "
				+ "descending. Alternatively, filter by recent dates. "
				+ "Maximum 100 orders per page. Read-only.",

			inputSchema: z.object({
				page: z.number()
					.int()
					.min(1)
					.default(1)
					.describe("Page number, starting at 1."),

				perPage: z.number()
					.int()
					.min(1)
					.max(100)
					.default(100)
					.describe("Number of orders per page, maximum 100."),

				minDate: z.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe(
						"Starting order creation date, YYYY-MM-DD."
					),

				maxDate: z.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe(
						"Ending order creation date, YYYY-MM-DD."
					),

				status: z.string()
					.optional()
					.describe(
						"Optional order status, such as delivered."
					),
			}),
		},
		async ({
			page,
			perPage,
			minDate,
			maxDate,
			status,
		}) => {
			try {
				const params = new URLSearchParams();

				params.set("page", String(page));
				params.set("perPage", String(perPage));

				if (minDate) {
					params.set("minDate", minDate);
				}

				if (maxDate) {
					params.set("maxDate", maxDate);
				}

				if (status) {
					params.set("status", status);
				}

				const data = await otoRequest(
					env,
					`orders?${params.toString()}`,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(data, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text:
								error instanceof Error
									? error.message
									: "Unknown OTO API error",
						},
					],
					isError: true,
				};
			}
		},
	);

	return server;
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const handler = createMcpHandler(() =>
			createServer(env as OtoEnv),
		);

		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
