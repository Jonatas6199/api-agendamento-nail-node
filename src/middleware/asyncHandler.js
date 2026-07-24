// Envolve handlers assíncronos e encaminha erros para o middleware de erro central
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
