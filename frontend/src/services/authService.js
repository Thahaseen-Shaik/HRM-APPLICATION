import api from './api';

export const login = async (payload) => {
  const { data } = await api.post('/api/v1/auth/login', payload);
  return data;
};

export const getMe = async () => {
  const { data } = await api.get('/api/v1/auth/me');
  return data;
};

export const updateProfile = async (payload) => {
  const { data } = await api.put('/api/v1/auth/updatedetails', payload);
  return data;
};

export const updatePassword = async (payload) => {
  const { data } = await api.put('/api/v1/auth/updatepassword', payload);
  return data;
};

export const registerPublic = async (payload) => {
  const { data } = await api.post('/api/v1/auth/register/public', payload);
  return data;
};

export const registerEmployee = async (payload) => {
  const { data } = await api.post('/api/v1/auth/register/employee', payload);
  return data;
};

export const registerAdmin = async (payload) => {
  const { data } = await api.post('/api/v1/auth/register', payload);
  return data;
};

export const getAdmins = async () => {
  const { data } = await api.get('/api/v1/auth/users');
  return data;
};

export const deleteAdmin = async (id) => {
  const { data } = await api.delete(`/api/v1/auth/users/${id}`);
  return data;
};

export const getTrialManagers = async () => {
  const { data } = await api.get('/api/v1/auth/trials');
  return data;
};

export const updateTrialManager = async (id, payload) => {
  const { data } = await api.put(`/api/v1/auth/trials/${id}`, payload);
  return data;
};
