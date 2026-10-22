import { LoginForm } from '@/modules/auth/components/LoginForm';

export const metadata = {
  title: 'Sign In - Family Reading Room',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900">
      <LoginForm />
    </main>
  );
}
