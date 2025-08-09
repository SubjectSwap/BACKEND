class IncorrectProfilePicFileType extends Error {
  constructor(message = 'The uploaded file is not of supported image extension') {
    super(message);
    this.name = 'IncorrectProfilePicFileType';
    this.statusCode = 400;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {IncorrectProfilePicFileType};