using System.IO;
using NUnit.Framework;
using UnityEngine;

namespace Ponyscapes.Tests
{
    /// <summary>First parity test. Fixtures come from fixtures-tool/export-fixtures.js, copied to Assets/StreamingAssets/fixtures/.</summary>
    public class RngParityTests
    {
        [System.Serializable] class Case { public int seed; public double[] values; }
        [System.Serializable] class Cases { public Case[] items; }

        [Test]
        public void Mulberry32_MatchesJs()
        {
            var path = Path.Combine(Application.streamingAssetsPath, "fixtures", "rng.json");
            var cases = JsonUtility.FromJson<Cases>("{\"items\":" + File.ReadAllText(path) + "}");
            foreach (var c in cases.items)
            {
                var r = new Ponyscapes.Sim.Mulberry32(c.seed);
                for (int i = 0; i < c.values.Length; i++)
                    Assert.AreEqual(c.values[i], r.Next(), 0.0, $"seed {c.seed} value {i}");
            }
        }
    }
}
