import * as v from "valibot";

export const PairingCodeSchema = v.pipe(
  v.object({
    code: v.pipe(v.string(), v.nonEmpty()),
    expires_in: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  v.transform(({ code, expires_in }) => ({ code, expiresIn: expires_in })),
);

export type PairingCode = v.InferOutput<typeof PairingCodeSchema>;

export const ServerInfoSchema = v.object({
  version: v.pipe(v.string(), v.nonEmpty()),
});

export type ServerInfo = v.InferOutput<typeof ServerInfoSchema>;
