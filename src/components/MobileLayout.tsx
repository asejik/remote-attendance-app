import React from 'react';
import { UpdateBanner } from './UpdateBanner';

interface MobileLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({ children, className = '' }) => {
  return (
    <div className="min-h-screen w-full bg-gray-100 flex justify-center">
      {/* Mobile Container */}
      <div className={`w-full max-w-md bg-white min-h-screen shadow-2xl relative ${className}`}>
        <UpdateBanner />
        {children}
      </div>
    </div>
  );
};