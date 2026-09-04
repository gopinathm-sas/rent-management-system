

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


/**
 * Sends an image to Google Gemini (Gemini 1.5 Flash) to extract the water meter reading.
 * @param {string} base64Image - The base64 encoded image string (without the data:image/... prefix).
 * @param {string} mimeType - The mime type of the image (e.g., "image/jpeg").
 * @returns {Promise<number|null>} - The extracted meter reading number or null if failed.
 */
export async function getMeterReadingFromImage(base64Image, mimeType = "image/jpeg") {
    try {
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is missing. Please check your .env file for VITE_GEMINI_API_KEY.");
        }

        console.log("Starting Gemini analysis...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: "Analyze this image of a water meter. Extract the numeric reading shown on the counter. Return ONLY the number. Do not assume the last digit is a decimal. Only use a decimal point if there is a clearly visible period (.) or comma (,) on the meter face. Otherwise, return the full integer. Ignore units or leading zeros. If you cannot clearly see a number, return 'ERROR'."
                        },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    maxOutputTokens: 50,
                    temperature: 0.2
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error Body:", errorText);
            throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        console.log("Gemini Raw Response:", text);

        if (!text || text.includes('ERROR')) {
            return null;
        }

        // Clean up text to find the first number
        const numberMatch = text.match(/(\d+\.?\d*)/);

        if (numberMatch) {
            return parseFloat(numberMatch[0]);
        }

        return null;

    } catch (error) {
        console.error("Failed to analyze image with Gemini:", error);
        throw error;
    }
}

/**
 * Analyze a receipt image to extract expense details.
 * @param {string} base64Image - Base64 string of the image
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<{date: string, amount: number, category: string, note: string}>}
 */
export async function analyzeReceipt(base64Image, mimeType = "image/jpeg") {
    try {
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is missing.");
        }

        const prompt = `
        Analyze this receipt or bill. Extract the following fields and return as a JSON object:
        - date: The date of the transaction in YYYY-MM-DD format (use today if missing).
        - amount: The total amount paid (number only).
        - note: The merchant name or a brief description of items.
        - category: Classify into one of these: "House Keeping Salary", "Electricity Bill", "Internet Bill", "Painting", "Room Maintenance", "Other".

        Return ONLY raw JSON. No markdown formatting.
        `;

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Image } }
                    ]
                }],
                generationConfig: { temperature: 0.2 }
            })
        });

        if (!response.ok) throw new Error("Gemini API request failed");

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        // Remove potential markdown code blocks
        const jsonStr = text.replace(/```json|```/g, "").trim();

        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Receipt analysis failed:", error);
        throw error;
    }
}

/**
 * Analyze a budget spreadsheet screenshot to extract credit and debit lists.
 * @param {string} base64Image - Base64 string of the image
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<{credits: object, otherCreditsNew: array, debitsNew: array, ccBillsNew: array, otherDebitsNew: array}>}
 */
export async function analyzeBudgetSpreadsheet(base64Image, mimeType = "image/jpeg") {
    try {
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is missing.");
        }

        const prompt = `
        Analyze this spreadsheet image of a monthly budget. Extract all the categories, descriptions, and their corresponding amounts.
        Please structure the response as a JSON object with these sections matching the table groups:
        - credits: An object with keys "rents", "waterGarbage", "freelance", "sal", "othersCredits" (map these to the numbers extracted under the main "Credits" section).
        - otherCreditsNew: An array of objects with fields "label" and "value" (for items in "Other Credits" section, e.g. "1 RK Advance" and its amount).
        - debitsNew: An array of objects with fields "label" and "value" (for items in the "Debits" section. Note: do NOT include "Credit Card Bills" in debitsNew since it is a formula total).
        - ccBillsNew: An array of objects with fields "label" and "value" (for items in "CC Bills" section like HDFC Credit Card, Axis ACE, IDFC, Indus Ind, etc.).
        - otherDebitsNew: An array of objects with fields "label" and "value" (for items in "Other Debits" section like Vanitha Pay, etc.).

        Guidelines:
        1. Extract the values carefully, ignoring currency symbols (₹) and commas. Only parse numbers.
        2. Make sure labels are human-readable (e.g. "Fullerton PL", "Vanitha Pay").
        3. Return ONLY raw JSON, with no markdown code blocks or additional text.
        `;

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Image } }
                    ]
                }],
                generationConfig: { temperature: 0.1 }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API Error Body:", errorText);
            throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        // Remove potential markdown code blocks
        const jsonStr = text.replace(/```json|```/g, "").trim();

        return JSON.parse(jsonStr);
    } catch (error) {
        console.error("Budget spreadsheet analysis failed:", error);
        throw error;
    }
}
