
const OPENAI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; // Reusing variable for convenience
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Sends an image to OpenAI (ChatGPT-4o) to extract the water meter reading.
 * @param {string} base64Image - The base64 encoded image string (without the data:image/... prefix).
 * @param {string} mimeType - The mime type of the image (e.g., "image/jpeg").
 * @returns {Promise<number|null>} - The extracted meter reading number or null if failed.
 */
export async function getMeterReadingFromImage(base64Image, mimeType = "image/jpeg") {
    try {
        if (!OPENAI_API_KEY) {
            throw new Error("API Key is missing. Please check your .env file.");
        }

        console.log("Starting OpenAI analysis...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analyze this image of a water meter. Extract the numeric reading shown on the counter. Return ONLY the number as a plain integer or float. Ignore any units or leading zeros if they are not part of the value. If you cannot clearly see a number, return 'ERROR'."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 50
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API Error Body:", errorText);
            throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();

        console.log("OpenAI Raw Response:", text);

        if (!text || text.includes('ERROR')) {
            return null;
        }

        const numberMatch = text.match(/(\d+\.?\d*)/);

        if (numberMatch) {
            return parseFloat(numberMatch[0]);
        }

        return null;

    } catch (error) {
        console.error("Failed to analyze image with OpenAI:", error);
        throw error;
    }
}
