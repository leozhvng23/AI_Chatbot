import * as AWS from "@aws-sdk/client-lex-runtime-v2";
const client = new AWS.LexRuntimeV2({ region: "us-east-1" });

export const handler = async (event, context) => {
	const msgFromUser = event.messages[0]["unstructured"]["text"];
	console.log(`Message from frontend: ${msgFromUser}`);

	// Initiate conversation with Lex
	const params = {
		botId: "J0K93PZOVI", 
		botAliasId: "TGVSTZGDPA", 
		localeId: "en_US",
		sessionId: "testuser",
		text: msgFromUser,
	};

	const response = await client.recognizeText(params);
	const msgFromLex = response.messages || [];

	// push all messages from Lex to the frontend
	if (msgFromLex.length > 0) {
		console.log(response);
		console.log(msgFromLex);

		let messages = [];

		for (let i = 0; i < msgFromLex.length; i++) {
			messages.push({
				type: "unstructured",
				unstructured: {
					text: msgFromLex[i].content,
				},
			});
		}

		const resp = {
			statusCode: 200,
			messages: messages,
		};

		return resp;
	}
};
