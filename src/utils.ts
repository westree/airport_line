const parseDateTime = (dateTimeStr: string | null, now: Date): Date | null => {
    if (!dateTimeStr) return null;

    let year, month, day, hours, minutes;

    if (dateTimeStr.includes('/')) { // YYYY/MM/DD HH:MM:SS format (e.g., "2025/07/30 07:50:00")
        const [datePart, timePart] = dateTimeStr.split(' ');
        const [y, m, d] = datePart.split('/').map(Number);
        const [h, min] = timePart.split(':').map(Number);
        year = y;
        month = m - 1; // Month is 0-indexed in JavaScript Date
        day = d;
        hours = h;
        minutes = min;
    } else if (dateTimeStr.length === 12) { // YYYYMMDDHHMM format (e.g., "202507300750")
        year = parseInt(dateTimeStr.substring(0, 4));
        month = parseInt(dateTimeStr.substring(4, 6)) - 1;
        day = parseInt(dateTimeStr.substring(6, 8));
        hours = parseInt(dateTimeStr.substring(8, 10));
        minutes = parseInt(dateTimeStr.substring(10, 12));
    } else {
        return null; // Unknown format
    }

    // Create a Date object in JST (UTC+9)
    let targetDate = new Date(Date.UTC(year, month, day, hours - 9, minutes, 0, 0));

    // If the targetDate (which is now in UTC, representing JST time) is in the past relative to 'now' (UTC),
    // it's likely meant for the next day. So, advance targetDate by one day.
    // This logic is crucial for handling flights that depart late at night and arrive the next day.
    if (targetDate.getTime() < now.getTime() - (24 * 60 * 60 * 1000) && (hours >= 0 && hours < 9)) { // If it's more than 24 hours in the past and in the early morning JST
        targetDate.setUTCDate(targetDate.getUTCDate() + 1);
    }

    return targetDate;
};

export { parseDateTime };