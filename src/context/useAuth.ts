import { useContext } from 'react';
import { AuthContext } from './authContextDef';

export const useAuth = () => useContext(AuthContext);
