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
		version: "1.1.0",
	});

	server.registerTool(
		"oto_account_info",
		{
			description:
				"Get the connected OTO account information. Read-only.",
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
				"Get recent orders from the connected OTO account. Read-only.",
			inputSchema: z.object({}),
		},
		async () => {
			try {
				const data = await otoRequest(env, "orders");

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
