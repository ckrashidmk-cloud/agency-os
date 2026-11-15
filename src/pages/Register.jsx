import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function Register() {
  return (
    <AuthLayout
      icon={Mail}
      title="Invitation required"
      subtitle="Agency OS customer access is invite-only"
      footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to log in</Link>}
    >
      <p className="text-center text-sm text-muted-foreground">
        Ask your agency contact to send an invitation to your email address. Use the invitation link to create your password and activate your portal account.
      </p>
    </AuthLayout>
  );
}
