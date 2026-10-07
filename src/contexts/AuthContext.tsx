import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, getUserRole } from '@/lib/supabase';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setUser(null);
        return;
      }
      
      const role = await getUserRole(authUser.id);
      const { data: profile } = await supabase
        .from('user_roles')
        .select('full_name, is_active')
        .eq('user_id', authUser.id)
        .single();
      
      setUser({
        id: authUser.id,
        email: authUser.email || '',
        full_name: profile?.full_name,
        role,
        is_active: profile?.is_active ?? true,
        created_at: authUser.created_at,
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: new Error(error.message) };
    
    if (data.user) {
      // First user becomes owner
      const { count } = await supabase.from('user_roles').select('*', { count: 'exact', head: true });
      const role = (count || 0) === 0 ? 'owner' : 'kasir';
      
      await supabase.from('user_roles').insert({
        user_id: data.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
      });
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};