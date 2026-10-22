import { RegisterForm } from '@/modules/auth/components/RegisterForm';

export const metadata = {
  title: 'Create Account - Family Reading Room',
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white dark:from-gray-950 dark:to-gray-900">
      <RegisterForm />
    </main>
  );
}
