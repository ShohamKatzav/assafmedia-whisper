import { useState, useEffect } from 'react';
import { Shield, User, Mail, Timer } from 'lucide-react';

const LoginPage = () => {
  const [step, setStep] = useState('login'); // 'login' or 'otp'
  const [formData, setFormData] = useState({
    username: '',
    otp: '',
    honeypot: '' // honeypot field for bot protection
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [canRequestNewOtp, setCanRequestNewOtp] = useState(true);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);

  // OTP timer countdown
  useEffect(() => {
    let interval;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
    } else if (otpTimer === 0 && step === 'otp') {
      setCanRequestNewOtp(true);
    }
    return () => clearInterval(interval);
  }, [otpTimer, step]);

  // Format timer display
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      setError('Username is required');
      return false;
    }
    // Check honeypot (should be empty)
    if (formData.honeypot) {
      setError('Bot detected');
      return false;
    }
    return true;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (blocked) {
      setError('Account temporarily blocked due to multiple failed attempts');
      return;
    }

    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/otp.php?data=request_otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: new URLSearchParams({
          username: formData.username
        }),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        // Move to OTP step
        setStep('otp');
        setOtpTimer(600); // 10 minutes
        setCanRequestNewOtp(false);
        setFailedAttempts(0);
      } else {
        setError(data.message || 'Login failed');
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        // Block after 10 failed attempts
        if (newFailedAttempts >= 10) {
          setBlocked(true);
          setError('Too many failed attempts. Account blocked for 24 hours.');
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.otp || formData.otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log(formData.username);
      console.log(formData.otp);
      const response = await fetch('/otp.php?data=verify_otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: new URLSearchParams({
          username: formData.username,
          otp: formData.otp
        }),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        // Store token and redirect to main application
        setCookie('Username', formData.username, 24);
        setCookie('Token', data.token, 24);
        window.location.href = 'http://localhost:8000/index.php';
      } else {
        setError(data.message || 'Invalid OTP');
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        if (newFailedAttempts >= 10) {
          setBlocked(true);
          setError('Too many failed attempts. Account blocked for 24 hours.');
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  function setCookie(name, value, hours = 24) {
    const expires = new Date(Date.now() + hours * 3600 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  }


  const requestNewOtp = async () => {
    if (!canRequestNewOtp || otpTimer > 0) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/otp.php?data=resend_otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: new URLSearchParams({
          username: formData.username
        }),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setOtpTimer(600); // Reset to 10 minutes
        setCanRequestNewOtp(false);
        setFormData(prev => ({ ...prev, otp: '' }));
      } else {
        setError(data.message || 'Failed to resend OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Secure Login</h1>
              <p className="text-blue-200">Enter your credentials to continue</p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-6">
                <p className="text-red-200 text-sm text-center">{error}</p>
              </div>
            )}

            {blocked && (
              <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 mb-6">
                <p className="text-yellow-200 text-sm text-center">
                  Account temporarily blocked. Please try again in 24 hours.
                </p>
              </div>
            )}

            <div className="space-y-6">
              {/* Honeypot field - hidden from users */}
              <input
                type="text"
                name="honeypot"
                value={formData.honeypot}
                onChange={handleInputChange}
                style={{ display: 'none' }}
                tabIndex="-1"
                autoComplete="off"
              />

              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Enter your username"
                    required
                    disabled={blocked}
                  />
                </div>
              </div>

              <button
                onClick={handleLogin}
                disabled={loading || blocked}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending OTP...' : 'Continue'}
              </button>
            </div>

            {failedAttempts > 0 && !blocked && (
              <div className="mt-4 text-center">
                <p className="text-yellow-200 text-sm">
                  Failed attempts: {failedAttempts}/10
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // OTP Step
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl border border-white/20 p-8">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Verify OTP</h1>
            <p className="text-blue-200">Enter the 6-digit code sent to your email</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-6">
              <p className="text-red-200 text-sm text-center">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                OTP Code
              </label>
              <input
                type="text"
                name="otp"
                value={formData.otp}
                onChange={handleInputChange}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white text-center text-xl tracking-widest placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                placeholder="000000"
                maxLength="6"
                pattern="[0-9]{6}"
                required
                disabled={blocked}
              />
            </div>

            <div className="text-center">
              {otpTimer > 0 ? (
                <div className="flex items-center justify-center text-blue-200">
                  <Timer className="w-4 h-4 mr-2" />
                  <span>OTP expires in: {formatTimer(otpTimer)}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={requestNewOtp}
                  disabled={loading || !canRequestNewOtp}
                  className="text-blue-300 hover:text-white underline disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Request new OTP
                </button>
              )}
            </div>

            <button
              onClick={handleOtpSubmit}
              disabled={loading || blocked}
              className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:from-green-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setStep('login');
                setFormData(prev => ({ ...prev, otp: '' }));
                setError('');
                setOtpTimer(0);
              }}
              className="text-blue-300 hover:text-white underline transition-colors"
            >
              Back to Login
            </button>
          </div>

          {failedAttempts > 0 && !blocked && (
            <div className="mt-4 text-center">
              <p className="text-yellow-200 text-sm">
                Failed attempts: {failedAttempts}/10
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;