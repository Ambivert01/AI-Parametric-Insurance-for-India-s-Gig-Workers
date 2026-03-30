import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useDispatch, useSelector } from 'react-redux';
import { selectAuth, uiActions, adminActions, claimsActions } from '../store/index';
import toast from 'react-hot-toast';

let socketInstance = null;

export const useSocket = () => {
  const { accessToken, isAuthenticated } = useSelector(selectAuth);
  const dispatch = useDispatch();
  const connected = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !accessToken || connected.current) return;

    socketInstance = io('http://localhost:5000', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketInstance.on('connect', () => { connected.current = true; });
    socketInstance.on('disconnect', () => { connected.current = false; });

    socketInstance.on('payout:completed', (data) => {
      dispatch(uiActions.setPayoutAlert(data));
      toast.success(`💰 ₹${data.amountInr} credited!`, { duration:6000, icon:'🛡️' });
    });

    socketInstance.on('claim:updated', (data) => {
      dispatch(claimsActions.updateClaimStatus({ id: data.claimId, status: data.status }));
      if (data.status === 'approved') toast(`✅ Claim approved!`, { icon:'🛡️' });
    });

    socketInstance.on('trigger:fired', (data) => {
      dispatch(adminActions.addLiveTrigger(data));
      dispatch(uiActions.setTriggerAlert(data));
    });

    return () => {
      if (socketInstance) { socketInstance.disconnect(); socketInstance = null; connected.current = false; }
    };
  }, [isAuthenticated, accessToken]);

  return socketInstance;
};

export const getSocket = () => socketInstance;
