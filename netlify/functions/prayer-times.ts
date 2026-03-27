import { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const { lat, lon, date } = event.queryStringParameters || {};
  const apiKey = process.env.ISLAMIC_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API key not configured" }),
    };
  }

  try {
    const apiUrl = `https://islamicapi.com/api/v1/prayer-time?lat=${lat}&lon=${lon}&date=${date}&api_key=${apiKey}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error("Error proxying prayer times:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch prayer times" }),
    };
  }
};
