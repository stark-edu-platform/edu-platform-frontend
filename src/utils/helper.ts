import { ErrorResponse, SuccessResponse } from '@/types/api.types';
import axios, { AxiosResponse } from 'axios';
export const errorResponse = (
  error: unknown,
  defaultMessage: string = 'Something went wrong',
  defaultStatusCode: number = 400,
) => {
  let message = defaultMessage;
  let statusCode = defaultStatusCode;

  if (axios.isAxiosError(error)) {
    message = error.response?.data?.message || error.message || defaultMessage;

    statusCode = error.response?.status || defaultStatusCode;
  } else if (error instanceof Error) {
    message = error.message;
  }

  const errorObj: ErrorResponse = {
    message,
    success: false,
    statusCode,
  };
  return errorObj;
};
type ApiSuccessData<T> = {
  message?: string;
  data?: T;
};

export const successResponse = <T>(
  response: AxiosResponse<ApiSuccessData<T>>,
  defaultMessage: string = 'Success',
): SuccessResponse<T> => {
  return {
    message: response.data?.message ?? defaultMessage,
    success: true,
    statusCode: response.status,
    // Backend always returns the { success, message, data } envelope, so read the
    // payload directly rather than casting the whole response body as T.
    data: response.data?.data as T,
  };
};

const helper = {
  errorResponse,
  successResponse,
};
export default helper;
