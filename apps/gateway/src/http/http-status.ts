export const HttpStatus = {
  SwitchingProtocols: 101,
  NoContent: 204,
  Unauthorized: 401,
  NotFound: 404,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
} as const;

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];
