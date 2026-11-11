export const HttpStatus = {
  SwitchingProtocols: 101,
  Ok: 200,
  Created: 201,
  NoContent: 204,
  SeeOther: 303,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
} as const;

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];
