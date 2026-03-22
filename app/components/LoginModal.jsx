'use client';

import Image from 'next/image';
import githubImg from '../assets/github.svg';

export default function LoginModal({
  onClose,
  loginLoading,
  loginError,
  handleGithubLogin
}) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
      onClick={onClose}
    >
      <div className="glass card modal login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ marginBottom: 16 }}>
          <Image src={githubImg} alt="GitHub" width={20} height={20} />
          <span>GitHub 登录</span>
          <span className="muted">仅允许指定 GitHub 账号登录</span>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <div className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.7 }}>
            点击下方按钮跳转到 GitHub 授权页面，登录成功后会自动返回当前站点。
          </div>
        </div>

        {loginError && (
          <div className="login-message error" style={{ marginBottom: 12 }}>
            <span>{loginError}</span>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={loginLoading}
          >
            取消
          </button>
          <button
            type="button"
            className="button"
            onClick={handleGithubLogin}
            disabled={loginLoading}
          >
            {loginLoading ? '跳转中...' : '使用 GitHub 登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
