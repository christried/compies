# UTC in the database, Europe/Berlin on screen

All instants are stored as `timestamptz` (UTC) and the .ics uses UTC `DTSTART`. Every displayed or entered time is interpreted in Europe/Berlin, hard-coded: there is no per-User time zone and no zone label in the UI, because the whole group lives in the German time zone. If someone abroad joins later, adding a User time zone only touches formatting and input parsing, not stored data.
