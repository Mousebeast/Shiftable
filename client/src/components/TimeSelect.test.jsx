import { toDisplayTime, toCompactTime } from './TimeSelect';

describe('toDisplayTime', () => {
  it('formats afternoon and morning times', () => {
    expect(toDisplayTime('15:00')).toBe('3:00 PM');
    expect(toDisplayTime('08:00')).toBe('8:00 AM');
    expect(toDisplayTime('06:30')).toBe('6:30 AM');
  });

  it('handles midnight and noon', () => {
    expect(toDisplayTime('00:00')).toBe('12:00 AM');
    expect(toDisplayTime('12:00')).toBe('12:00 PM');
  });

  it('returns an empty string for missing input', () => {
    expect(toDisplayTime('')).toBe('');
    expect(toDisplayTime(null)).toBe('');
    expect(toDisplayTime(undefined)).toBe('');
  });
});

describe('toCompactTime', () => {
  it('drops the minutes on the hour', () => {
    expect(toCompactTime('15:00')).toBe('3p');
    expect(toCompactTime('16:00')).toBe('4p');
    expect(toCompactTime('08:00')).toBe('8a');
    expect(toCompactTime('11:00')).toBe('11a');
  });

  it('keeps the minutes when they are not :00', () => {
    expect(toCompactTime('06:30')).toBe('6:30a');
    expect(toCompactTime('17:45')).toBe('5:45p');
    expect(toCompactTime('12:15')).toBe('12:15p');
  });

  // 0 and 12 are where hour-conversion bugs show up: 0 % 12 is 0, not 12.
  it('handles midnight and noon', () => {
    expect(toCompactTime('00:00')).toBe('12a');
    expect(toCompactTime('12:00')).toBe('12p');
    expect(toCompactTime('00:30')).toBe('12:30a');
    expect(toCompactTime('12:30')).toBe('12:30p');
  });

  it('pads single-digit minutes', () => {
    expect(toCompactTime('09:05')).toBe('9:05a');
  });

  it('returns an empty string for missing input', () => {
    expect(toCompactTime('')).toBe('');
    expect(toCompactTime(null)).toBe('');
    expect(toCompactTime(undefined)).toBe('');
  });

  it('never loses information relative to toDisplayTime', () => {
    // Same instant, same meridiem — compact only removes a redundant ":00".
    for (const t of ['00:00', '06:30', '08:00', '12:00', '15:00', '23:59']) {
      const compactMeridiem = toCompactTime(t).slice(-1);
      const fullMeridiem = toDisplayTime(t).endsWith('AM') ? 'a' : 'p';
      expect(compactMeridiem).toBe(fullMeridiem);
    }
  });
});
