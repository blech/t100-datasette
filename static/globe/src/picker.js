// The airport map's picker offers every airport the map knows, abroad as well as in the US: [{ value: code, label: "place – name" }]
export const pickerOptions = (airports) => [...airports].map((a) => ({ value: a.code, label: [a.place, a.name].filter(Boolean).join(' – ') }));
