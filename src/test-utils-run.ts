
import { computeFinancialsForMonth } from './lib/utils';
import { IMMUTABLE_ROOMS_DATA } from './lib/constants';

console.log("Starting test...");

const mockTenants = {
    "t1": { id: "t1", roomId: "1-100", roomNo: "100", status: "Occupied", rent: 5000, waterRate: 100, paymentHistory: { "2026-January": "Paid" } }
};

const mockRooms = IMMUTABLE_ROOMS_DATA;

try {
    const result = computeFinancialsForMonth(mockTenants as any, mockRooms, 2026, 0); // Jan 2026
    console.log("Result:", result);
    console.log("Success!");
} catch (error) {
    console.error("Crash:", error);
    process.exit(1);
}
