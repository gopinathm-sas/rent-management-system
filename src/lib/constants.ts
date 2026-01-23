import { RoomData } from '../types';

export const IMMUTABLE_ROOMS_DATA: Record<string, RoomData> = {
    '01': { roomNo: '01', roomId: 'G01', keyNo: '124', ebServNo: '19781', ebAcNo: '5097784' },
    '02': { roomNo: '02', roomId: 'G02', keyNo: '153', ebServNo: '19778', ebAcNo: '5097781' },
    '04': { roomNo: '04', roomId: '102', keyNo: '76', ebServNo: '19780', ebAcNo: '5097783' },
    '05': { roomNo: '05', roomId: '201', keyNo: '151', ebServNo: '19779', ebAcNo: '5097782' },
    '06': { roomNo: '06', roomId: '202', keyNo: '185', ebServNo: '19782', ebAcNo: '5097785' },
    '07': { roomNo: '07', roomId: '203', keyNo: '101', ebServNo: '19783', ebAcNo: '5097786' },
    '08': { roomNo: '08', roomId: '301', keyNo: '403', ebServNo: '19784', ebAcNo: '5097787' },
    '09': { roomNo: '09', roomId: '302', keyNo: '249', ebServNo: '19785', ebAcNo: '5097788' },
    '10': { roomNo: '10', roomId: '303', keyNo: '123', ebServNo: '19789', ebAcNo: '5097792' },
    '11': { roomNo: '11', roomId: '401', keyNo: '35', ebServNo: '19788', ebAcNo: '5097791' },
    '12': { roomNo: '12', roomId: '402', keyNo: '144', ebServNo: '19787', ebAcNo: '5097790' },
    '13': { roomNo: '13', roomId: '403', keyNo: '120', ebServNo: '19786', ebAcNo: '5097789' }
};

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DEFAULT_WATER_RATE = 0.25;
export const DISCOUNTED_WATER_RATE = 0.20;
export const DISCOUNTED_WATER_ROOMS = ['11', '12', '13']; // Set check done via includes

export const WATER_UNITS_MULTIPLIER = 10;
export const RENT_WATER_SERVICE_CHARGE = 60;
