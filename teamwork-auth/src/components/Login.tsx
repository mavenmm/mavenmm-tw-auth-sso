import "@teamwork/login-button";
import { useContext } from "react";
import { AuthContext } from "../providers/AuthProvider";
import type { LoginProps } from "../types";

export function Login({
  clientID,
  redirectURI,
  clientSecret
}: LoginProps = {}) {
  // For production npm package, we require props to be passed
  // Environment variables are only for development/testing
  const TEAMWORK_CLIENT_ID = clientID;
  const TEAMWORK_REDIRECT_URI = redirectURI;
  const TEAMWORK_CLIENT_SECRET = clientSecret;
  // Why the auth service refused the last sign-in, if it did. Undefined outside
  // an AuthProvider (the context default is empty), which shows nothing.
  const { accessDenied } = useContext(AuthContext);

  // Check if required props are available
  if (!TEAMWORK_CLIENT_ID || !TEAMWORK_REDIRECT_URI) {
    const missingVars = [];
    if (!TEAMWORK_CLIENT_ID) missingVars.push('clientID');
    if (!TEAMWORK_REDIRECT_URI) missingVars.push('redirectURI');

    return (
      <div style={{
        padding: '20px',
        border: '2px solid #f44336',
        borderRadius: '8px',
        backgroundColor: '#ffebee',
        color: '#c62828'
      }}>
        <h3>⚠️ Login Configuration Error</h3>
        <p>Missing required Teamwork OAuth configuration:</p>
        <ul>
          {missingVars.map(varName => (
            <li key={varName}><strong>{varName}</strong></li>
          ))}
        </ul>
        <p>Either pass as props or set environment variables:</p>
        <pre style={{ background: '#f5f5f5', padding: '10px', fontSize: '12px' }}>
{`// As props:
<Login
  clientID="your_teamwork_client_id"
  redirectURI="https://your-app.com"
/>

// Or as environment variables:
VITE_TEAMWORK_CLIENT_ID=your_teamwork_client_id
VITE_TEAMWORK_REDIRECT_URI=https://your-app.com`}
        </pre>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {accessDenied && (
        <p
          role="alert"
          style={{
            maxWidth: '28rem',
            margin: '0 0 16px',
            padding: '12px 16px',
            border: '1px solid #f5c2c0',
            borderRadius: '6px',
            backgroundColor: '#fdecea',
            color: '#8a1c14',
            fontSize: '14px',
            lineHeight: 1.4,
            textAlign: 'center',
          }}
        >
          {accessDenied.message}
        </p>
      )}
      {/* @ts-ignore - Teamwork login button is a web component */}
      <teamwork-login-button
        redirectURI={TEAMWORK_REDIRECT_URI}
        clientID={TEAMWORK_CLIENT_ID}
        icon="false"
        color="slate"
        size="medium"
        borders="default"
      />

      {/* Debug info for development - only show if we have client secret (dev mode) */}
      {TEAMWORK_CLIENT_SECRET && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: '5px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          <h4>🔧 Debug Info:</h4>
          <table>
            <tbody>
              <tr>
                <td style={{ paddingRight: '10px' }}>Redirect URI:</td>
                <td>{TEAMWORK_REDIRECT_URI}</td>
              </tr>
              <tr>
                <td style={{ paddingRight: '10px' }}>Client ID:</td>
                <td>{TEAMWORK_CLIENT_ID}</td>
              </tr>
              <tr>
                <td style={{ paddingRight: '10px' }}>Client Secret:</td>
                <td>***hidden***</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
