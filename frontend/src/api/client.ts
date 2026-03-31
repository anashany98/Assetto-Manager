import axios from 'axios';
import { API_URL } from '../config';
import { installAuthInterceptors } from '../auth/http';

const client = axios.create({
    baseURL: API_URL,
    withCredentials: true,  // Send httpOnly cookies with every request
});

installAuthInterceptors(client);

export default client;
