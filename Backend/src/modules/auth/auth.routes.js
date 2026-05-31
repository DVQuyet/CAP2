const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const authController = require('./auth.controller');
const clanController = require('../clan/clan.controller');
const {
    buildOAuthRedirectUrl,
    handleSocialLogin,
} = require('./socialAuth.service');

function getBackendUrl() {
    return String(
        process.env.BACKEND_URL ||
        process.env.BACKEND_PUBLIC_URL ||
        process.env.PUBLIC_API_URL ||
        'http://localhost:3000'
    ).replace(/\/$/, '');
}

function getCallbackUrl(provider) {
    const envKey = provider === 'google' ? 'GOOGLE_CALLBACK_URL' : 'FACEBOOK_CALLBACK_URL';
    return process.env[envKey] || `${getBackendUrl()}/api/auth/${provider}/callback`;
}

function getProfileEmail(profile) {
    return profile?.emails?.[0]?.value || '';
}

function getProfileAvatar(profile) {
    return profile?.photos?.[0]?.value || '';
}

function parseScopeList(value) {
    return String(value || '')
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

const facebookScopes = parseScopeList(process.env.FACEBOOK_AUTH_SCOPE);
const facebookAuthOptions = facebookScopes.length
    ? { scope: facebookScopes, session: false }
    : { session: false };

const oauthConfigured = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    facebook: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
};

if (oauthConfigured.google) {
    passport.use(new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: getCallbackUrl('google'),
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const result = await handleSocialLogin({
                    provider: 'google',
                    providerId: profile.id,
                    email: getProfileEmail(profile),
                    fullName: profile.displayName,
                    avatarUrl: getProfileAvatar(profile),
                });
                done(null, result);
            } catch (error) {
                done(error);
            }
        }
    ));
}

if (oauthConfigured.facebook) {
    passport.use(new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_APP_ID,
            clientSecret: process.env.FACEBOOK_APP_SECRET,
            callbackURL: getCallbackUrl('facebook'),
            profileFields: ['id', 'displayName', 'emails', 'photos'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = getProfileEmail(profile);
                if (!email) {
                    const error = new Error('Khong lay duoc email tu Facebook. Vui long dung Google hoac tai khoan thuong.');
                    error.code = 'FACEBOOK_EMAIL_REQUIRED';
                    throw error;
                }

                const result = await handleSocialLogin({
                    provider: 'facebook',
                    providerId: profile.id,
                    email,
                    fullName: profile.displayName,
                    avatarUrl: getProfileAvatar(profile),
                });
                done(null, result);
            } catch (error) {
                done(error);
            }
        }
    ));
}

function requireOAuthConfig(provider) {
    return (req, res, next) => {
        if (oauthConfigured[provider]) return next();
        return res.status(503).json({
            success: false,
            message: `${provider} OAuth chua duoc cau hinh tren backend.`,
        });
    };
}

function oauthCallback(provider) {
    return (req, res, next) => {
        if (!oauthConfigured[provider]) {
            return res.redirect(buildOAuthRedirectUrl({
                error: `${provider}_not_configured`,
                message: `${provider} OAuth chua duoc cau hinh tren backend.`,
            }));
        }

        return passport.authenticate(provider, { session: false }, (error, result) => {
            if (error) {
                console.error(`${provider} OAuth callback error:`, error);
                return res.redirect(buildOAuthRedirectUrl({
                    error: error.code || 'oauth_failed',
                    message: error.message || 'Dang nhap mang xa hoi that bai.',
                }));
            }
            if (!result?.token) {
                return res.redirect(buildOAuthRedirectUrl({
                    error: 'oauth_failed',
                    message: 'Dang nhap mang xa hoi that bai.',
                }));
            }
            return res.redirect(buildOAuthRedirectUrl({ token: result.token }));
        })(req, res, next);
    };
}

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/google', requireOAuthConfig('google'), passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', oauthCallback('google'));
router.get('/facebook', requireOAuthConfig('facebook'), passport.authenticate('facebook', facebookAuthOptions));
router.get('/facebook/callback', oauthCallback('facebook'));
router.get('/me', authController.me);
router.post('/forgot-password', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPasswordWithCode);
router.post('/register-clan', clanController.registerClan);
router.post('/register-clan-manager', clanController.registerClanWithManager);

module.exports = router;
