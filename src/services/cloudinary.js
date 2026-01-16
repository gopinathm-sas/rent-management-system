
const CLOUD_NAME = "dhze5ifcf"; // User provided
const UPLOAD_PRESET = "mi_unsigned_preset"; // User provided

export const uploadToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    // Optional: Add folder
    // formData.append('folder', 'tenant_documents');

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || "Cloudinary Upload Failed");
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary Service Error:", error);
        throw error;
    }
};
