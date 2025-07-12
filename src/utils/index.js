const isAlreadyLogin = () => {
  const accessToken = localStorage.getItem("accessToken");
  return !!accessToken;
};

export { isAlreadyLogin };
