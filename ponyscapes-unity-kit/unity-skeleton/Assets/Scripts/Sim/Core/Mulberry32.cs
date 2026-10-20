using System;

namespace Ponyscapes.Sim
{
    /// <summary>Port of mulberry32 (public/js/shared/mathUtils.js). Must match the JS output exactly.</summary>
    public sealed class Mulberry32
    {
        int a;
        public Mulberry32(int seed) { a = seed; }

        public double Next()
        {
            a = unchecked(a + 0x6D2B79F5);
            int t = unchecked((a ^ (int)((uint)a >> 15)) * (1 | a));          // Math.imul
            t = unchecked((t + (t ^ (int)((uint)t >> 7)) * (61 | t)) ^ t);
            return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0;
        }
    }
}
