import React, { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, parseEther } from "ethers";
import HRChainABI from "./HRChain.json";
import clickSound from "./click.wav";
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";
import { WalletConnectConnector } from "@web3-react/walletconnect-connector";

// Environment configuration
const config = {
  CONTRACT_ADDRESS: process.env.REACT_APP_CONTRACT_ADDRESS || "0x53dD1b708b3B23cdD63eD6Fc882780dEBb647BA0",
  RPC_URLS: [
    process.env.REACT_APP_PRIMARY_RPC_URL || "https://rpc.nexus.xyz/http",
    process.env.REACT_APP_BACKUP_RPC_URL || "https://backup-rpc.nexus.xyz/http"
  ],
  CHAIN_ID: process.env.REACT_APP_CHAIN_ID || "393",
  CHAIN_NAME: process.env.REACT_APP_CHAIN_NAME || "Nexus Devnet"
};

// Initialize WalletConnect
const walletconnect = new WalletConnectConnector({
  rpc: { [parseInt(config.CHAIN_ID)]: config.RPC_URLS[0] },
  bridge: "https://bridge.walletconnect.org",
  qrcode: true,
});

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [limit, setLimit] = useState("");
  const [jobId, setJobId] = useState("");
  const [jobDetails, setJobDetails] = useState(null);
  const [employerJobs, setEmployerJobs] = useState([]);
  const [filter, setFilter] = useState("All");
  const [theme, setTheme] = useState("dark");
  const [isLoading, setIsLoading] = useState(false);
  const [activeRpcIndex, setActiveRpcIndex] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Preload audio
  const clickAudio = new Audio(clickSound);
  clickAudio.preload = "auto";

  const playSound = () => {
    if (!soundEnabled) return;
    clickAudio.play().catch((error) => {
      console.log("Sound play error:", error);
      if (soundEnabled) {
        setSoundEnabled(false);
        toast.info("Sound effects disabled due to browser restrictions", {
          position: "bottom-left",
          autoClose: 3000,
          theme: theme
        });
      }
    });
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
    playSound();
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) {
      toast.info("Sound effects enabled", {
        position: "bottom-left",
        autoClose: 2000,
        theme: theme
      });
    } else {
      toast.info("Sound effects disabled", {
        position: "bottom-left",
        autoClose: 2000,
        theme: theme
      });
    }
  };

  const connectWallet = async (connectionType = 'metamask') => {
    setIsLoading(true);
    try {
      if (connectionType === 'metamask') {
        if (!window.ethereum) {
          toast.error("MetaMask not detected! Please install MetaMask or try another connection method.", {
            position: "top-center",
            autoClose: 5000,
            theme: theme
          });
          setIsLoading(false);
          return;
        }
        const browserProvider = new BrowserProvider(window.ethereum);
        await browserProvider.send("eth_requestAccounts", []);
        const walletSigner = await browserProvider.getSigner();
        const address = await walletSigner.getAddress();
        const contractInstance = new Contract(config.CONTRACT_ADDRESS, HRChainABI, walletSigner);
        setProvider(browserProvider);
        setSigner(walletSigner);
        setContract(contractInstance);
        setAccount(address);
        try {
          await switchToCorrectNetwork(window.ethereum);
        } catch (switchError) {
          console.error("Network switch error:", switchError);
          toast.error("Failed to switch network. Please try again.", {
            position: "top-right",
            autoClose: 5000,
            theme: theme
          });
          setIsLoading(false);
          return;
        }
        toast.success("Connected to wallet successfully!", {
          position: "top-right",
          autoClose: 3000,
          theme: theme
        });
      } else if (connectionType === 'walletconnect') {
        await walletconnect.activate();
        const address = walletconnect.account;
        const wcProvider = new BrowserProvider(walletconnect.provider);
        const wcSigner = wcProvider.getSigner();
        const contractInstance = new Contract(config.CONTRACT_ADDRESS, HRChainABI, wcSigner);
        setProvider(wcProvider);
        setSigner(wcSigner);
        setContract(contractInstance);
        setAccount(address);
        toast.success("Connected via WalletConnect!", {
          position: "top-right",
          autoClose: 3000,
          theme: theme
        });
      }
    } catch (error) {
      console.error("Wallet connection error:", error);
      toast.error(`Connection failed: ${error.message || "Unknown error"}`, {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
    } finally {
      setIsLoading(false);
    }
  };

  const switchToCorrectNetwork = async (ethereum) => {
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${parseInt(config.CHAIN_ID).toString(16)}` }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${parseInt(config.CHAIN_ID).toString(16)}`,
            chainName: config.CHAIN_NAME,
            rpcUrls: config.RPC_URLS,
            nativeCurrency: { name: "NEX", symbol: "NEX", decimals: 18 },
          }],
        });
      } else {
        throw switchError;
      }
    }
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setContract(null);
    setAccount(null);
    setEmployerJobs([]);
    setJobDetails(null);
    toast.info("Wallet disconnected", {
      position: "top-right",
      autoClose: 3000,
      theme: theme
    });
  };

  const getFallbackProvider = () => {
    if (!provider && signer) {
      const nextRpcIndex = (activeRpcIndex + 1) % config.RPC_URLS.length;
      setActiveRpcIndex(nextRpcIndex);
      console.log(`Switching to fallback RPC: ${config.RPC_URLS[nextRpcIndex]}`);
      return new JsonRpcProvider(config.RPC_URLS[nextRpcIndex]);
    }
    return provider;
  };

  const fetchEmployerJobs = useCallback(async () => {
    if (!contract || !account) {
      console.warn("Cannot fetch jobs: contract or account not set");
      return;
    }
    setIsLoading(true);
    try {
      const jobs = await contract.getEmployerJobs(account, 0, 10);
      console.log('Raw Job IDs:', jobs);
      if (jobs.length === 0) {
        console.log("No jobs found for employer:", account);
        setEmployerJobs([]);
        setIsLoading(false);
        return;
      }
      const jobDetailsPromises = jobs.map(async (jobId) => {
        try {
          const details = await contract.getJob(jobId);
          console.log(`Job ${jobId} Raw Status:`, details.status);
          const jobStatus = Number(details.status) === 0 ? "Open" : "Closed";
          console.log(`Job ${jobId} Interpreted Status:`, jobStatus);
          return {
            id: jobId.toString(),
            title: details.title,
            status: jobStatus,
          };
        } catch (error) {
          console.error(`Error fetching details for job ${jobId}:`, error);
          return {
            id: jobId.toString(),
            title: "Error loading title",
            status: "Unknown",
            error: true
          };
        }
      });
      const jobDetails = await Promise.all(jobDetailsPromises);
      console.log('Processed Employer Jobs:', jobDetails);
      setEmployerJobs(jobDetails);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      toast.error("Failed to fetch jobs. Retrying with backup RPC...", {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
      try {
        const fallbackProvider = getFallbackProvider();
        if (fallbackProvider && signer) {
          const fallbackContract = new Contract(config.CONTRACT_ADDRESS, HRChainABI, signer.connect(fallbackProvider));
          const jobs = await fallbackContract.getEmployerJobs(account, 0, 10);
          const jobDetailsPromises = jobs.map(async (jobId) => {
            const details = await fallbackContract.getJob(jobId);
            const jobStatus = Number(details.status) === 0 ? "Open" : "Closed";
            return {
              id: jobId.toString(),
              title: details.title,
              status: jobStatus,
            };
          });
          const jobDetails = await Promise.all(jobDetailsPromises);
          setEmployerJobs(jobDetails);
        } else {
          throw new Error("No fallback provider available");
        }
      } catch (fallbackError) {
        console.error("Fallback RPC also failed:", fallbackError);
        toast.error("Failed to fetch jobs. Please try again later.", {
          position: "top-right",
          autoClose: 5000,
          theme: theme
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [contract, account, theme, activeRpcIndex, provider, signer]);

  useEffect(() => {
    if (contract) {
      const onJobListed = (jobId, employer) => {
        console.log(`Job ${jobId} listed by ${employer}`);
        if (employer.toLowerCase() === account?.toLowerCase()) {
          fetchEmployerJobs();
          toast.success(`🚀 Your new mission #${jobId} has been launched!`, {
            position: "top-right",
            autoClose: 5000,
            theme: theme
          });
        }
      };

      const onApplicationSubmitted = (jobId, applicant) => {
        console.log(`Application submitted for job ${jobId} by ${applicant}`);
        toast.info(`🚀 New application for Mission #${jobId} by ${applicant.slice(0, 6)}...`, {
          position: "top-right",
          autoClose: 5000,
          theme: theme
        });
      };

      const onJobClosed = (jobId, employer) => {
        console.log(`Job ${jobId} closed by ${employer}`);
        if (employer?.toLowerCase() === account?.toLowerCase()) {
          fetchEmployerJobs();
          toast.info(`🌌 Mission #${jobId} has been closed!`, {
            position: "top-right",
            autoClose: 5000,
            theme: theme
          });
        }
      };

      contract.on("JobListed", onJobListed);
      contract.on("ApplicationSubmitted", onApplicationSubmitted);
      contract.on("JobClosed", onJobClosed);

      fetchEmployerJobs();

      return () => {
        if (contract.removeAllListeners) {
          contract.removeAllListeners("JobListed");
          contract.removeAllListeners("ApplicationSubmitted");
          contract.removeAllListeners("JobClosed");
        } else {
          contract.off("JobListed", onJobListed);
          contract.off("ApplicationSubmitted", onApplicationSubmitted);
          contract.off("JobClosed", onJobClosed);
        }
      };
    }
  }, [contract, account, theme, fetchEmployerJobs]);

  // Load theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('hrchain-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // Save theme when it changes
  useEffect(() => {
    localStorage.setItem('hrchain-theme', theme);
  }, [theme]);

  const listJob = async () => {
    if (!contract) {
      toast.error("Wallet not connected", {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
      return;
    }
    if (!title || !description || !limit) {
      toast.warning("Please fill in all job details", {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
      return;
    }
    setIsLoading(true);
    try {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum <= 0) {
        throw new Error("Crew limit must be a positive number");
      }
      const tx = await contract.listJob(title, description, limitNum, {
        value: parseEther("0.01"),
      });
      toast.info(`🚀 Mission launch initiated! Transaction hash: ${tx.hash.slice(0, 10)}...`, {
        position: "bottom-right",
        autoClose: 5000,
        theme: theme
      });
      await tx.wait();
      toast.success("Mission launched successfully!", {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
      setTitle("");
      setDescription("");
      setLimit("");
      fetchEmployerJobs();
    } catch (error) {
      console.error("Error listing job:", error);
      let errorMessage = "Failed to launch mission";
      if (error.reason) {
        errorMessage += `: ${error.reason}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyToJob = async () => {
    if (!contract || !jobId) {
      toast.error("Please connect wallet and enter a job ID", {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
      return;
    }
    setIsLoading(true);
    try {
      const jobIdNum = parseInt(jobId);
      if (isNaN(jobIdNum) || jobIdNum < 0) {
        throw new Error("Invalid job ID");
      }
      const jobInfo = await contract.getJob(jobIdNum);
      if (Number(jobInfo.status) !== 0) {
        throw new Error("This mission is no longer accepting applications");
      }
      const tx = await contract.applyToJob(jobIdNum);
      toast.info(`🚀 Application sent! Transaction hash: ${tx.hash.slice(0, 10)}...`, {
        position: "bottom-right",
        autoClose: 5000,
        theme: theme
      });
      await tx.wait();
      toast.success("Application successfully sent into orbit!", {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
      setJobId("");
    } catch (error) {
      console.error("Error applying to job:", error);
      let errorMessage = "Application failed";
      if (error.reason) {
        errorMessage += `: ${error.reason}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getJobDetails = async () => {
    if (!contract || !jobId) {
      toast.error("Please connect wallet and enter a job ID", {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
      return;
    }
    setIsLoading(true);
    try {
      const jobIdNum = parseInt(jobId);
      if (isNaN(jobIdNum) || jobIdNum < 0) {
        throw new Error("Invalid job ID");
      }
      const job = await contract.getJob(jobIdNum);
      console.log(`Job ${jobId} Raw Status (getJobDetails):`, job.status);
      const jobStatus = Number(job.status) === 0 ? "Open" : "Closed";
      setJobDetails({
        employer: job.employer,
        title: job.title,
        descriptionHash: job.descriptionHash,
        applicationLimit: job.applicationLimit.toString(),
        applicationsCount: job.applicationsCount.toString(),
        status: jobStatus,
      });
      toast.success(`Mission details retrieved successfully`, {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
    } catch (error) {
      console.error("Error in getJobDetails:", error);
      setJobDetails(null);
      let errorMessage = "Failed to retrieve mission details";
      if (error.reason) {
        errorMessage += `: ${error.reason}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
    } finally {
      setIsLoading(false);
    }
  };

  const closeJob = async () => {
    if (!contract || !jobId) {
      toast.error("Please connect wallet and enter a job ID", {
        position: "top-right",
        autoClose: 3000,
        theme: theme
      });
      return;
    }
    setIsLoading(true);
    try {
      const jobIdNum = parseInt(jobId);
      if (isNaN(jobIdNum) || jobIdNum < 0) {
        throw new Error("Invalid job ID");
      }
      const jobInfo = await contract.getJob(jobIdNum);
      if (jobInfo.employer.toLowerCase() !== account.toLowerCase()) {
        throw new Error("You are not the commander of this mission");
      }
      if (Number(jobInfo.status) !== 0) {
        throw new Error("This mission is already closed");
      }
      const tx = await contract.closeJob(jobIdNum);
      toast.info(`🌌 Closing mission! Transaction hash: ${tx.hash.slice(0, 10)}...`, {
        position: "bottom-right",
        autoClose: 5000,
        theme: theme
      });
      await tx.wait();
      toast.success("Mission closed—journey complete!", {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
      setJobId("");
      fetchEmployerJobs();
    } catch (error) {
      console.error("Error closing job:", error);
      let errorMessage = "Failed to close mission";
      if (error.reason) {
        errorMessage += `: ${error.reason}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        theme: theme
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredJobs = employerJobs.filter((job) => {
    if (filter === "All") return true;
    if (filter === 'Open') return job.status.toLowerCase() === 'open';
    if (filter === 'Closed') return job.status.toLowerCase() === 'closed';
    return true;
  });

  const particlesInit = async (engine) => {
    await loadSlim(engine);
  };

  return (
    <div className={`App ${theme}`}>
      <link
        href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Montserrat:wght@400;500&display=swap"
        rel="stylesheet"
      />
      <Particles
        key={theme}
        id="tsparticles"
        init={particlesInit}
        options={{
          background: { color: { value: "transparent" } },
          fpsLimit: 60,
          particles: {
            number: { value: 80, density: { enable: true, value_area: 800 } },
            color: { value: theme === "dark" ? "#ffffff" : "#000000" },
            shape: { type: "circle" },
            opacity: { value: 0.5, random: true, anim: { enable: true, speed: 1, opacity_min: 0.1 } },
            size: { value: 3, random: true, anim: { enable: true, speed: 2, size_min: 0.1 } },
            move: { enable: true, speed: 1, direction: "none", random: true, straight: false, outModes: { default: "out" } },
          },
          interactivity: {
            events: { onHover: { enable: true, mode: "repulse" }, onClick: { enable: true, mode: "push" } },
            modes: { repulse: { distance: 100, duration: 0.4 }, push: { quantity: 4 } },
          },
          detectRetina: true,
        }}
      />
      <header>
        <h1>HRChain: Cosmic Job Portal</h1>
        <p className="tagline">Launch your career into the blockchain galaxy!</p>
        <div className="controls">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>
          <button className="sound-toggle" onClick={toggleSound}>
            {soundEnabled ? "🔊 Sound On" : "🔇 Sound Off"}
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading cosmic data...</p>
        </div>
      )}

      {!account ? (
        <div className="connect-pod">
          <button
            className="glow-btn"
            onClick={() => { connectWallet('metamask'); playSound(); }}
            disabled={isLoading}
          >
            Enter the Cosmos (MetaMask)
          </button>
          <button
            className="glow-btn secondary"
            onClick={() => { connectWallet('walletconnect'); playSound(); }}
            disabled={isLoading}
          >
            Connect with WalletConnect
          </button>
          <p className="connect-note">
            No wallet? Install <a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">MetaMask</a> to join our space expedition!
          </p>
        </div>
      ) : (
        <div className="dashboard">
          <div className="account-bar">
            <p className="account">Pilot: {account}</p>
            <button
              className="disconnect-btn"
              onClick={() => { disconnectWallet(); playSound(); }}
            >
              Eject 🚀
            </button>
          </div>

          <div className="galaxy-map">
            <h2>Galaxy Map: Your Missions</h2>
            <div className="filter">
              <label>Filter: </label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="All">All</option>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
              </select>
              <button
                className="refresh-btn"
                onClick={() => { fetchEmployerJobs(); playSound(); }}
                disabled={isLoading}
              >
                🔄 Refresh
              </button>
            </div>
            {isLoading ? (
              <p>Scanning the cosmos...</p>
            ) : filteredJobs.length === 0 ? (
              <p>No missions found. Launch a new job to get started!</p>
            ) : (
              <div className="job-cards">
                {filteredJobs.map((job) => (
                  <div key={job.id} className={`job-card ${job.error ? 'error' : ''} ${job.status.toLowerCase()}`}>
                    <h3>Mission #{job.id}: {job.title}</h3>
                    <p className={`status ${job.status.toLowerCase()}`}>
                      Status: {job.status}
                    </p>
                    <button
                      className="glow-btn"
                      onClick={() => { setJobId(job.id); playSound(); }}
                      disabled={isLoading}
                    >
                      Select
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="job-pods">
            <div className="pod list-pod">
              <h2>List a Job</h2>
              <p>Send 0.01 NEX to launch a new mission.</p>
              <input
                placeholder="Job Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
              />
              <input
                placeholder="Mission Brief"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
              />
              <input
                placeholder="Crew Limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                type="number"
                min="1"
                disabled={isLoading}
              />
              <button
                className="glow-btn"
                onClick={() => { listJob(); playSound(); }}
                disabled={isLoading || !title || !description || !limit}
              >
                Launch Job
              </button>
            </div>

            <div className="pod apply-pod">
              <h2>Join a Mission</h2>
              <p>Apply to an open job in the galaxy.</p>
              <input
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                type="number"
                min="0"
                disabled={isLoading}
              />
              <button
                className="glow-btn"
                onClick={() => { applyToJob(); playSound(); }}
                disabled={isLoading || !jobId}
              >
                Apply Now
              </button>
            </div>

            <div className="pod view-pod">
              <h2>Scan Job Data</h2>
              <p>Retrieve mission details.</p>
              <input
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                type="number"
                min="0"
                disabled={isLoading}
              />
              <button
                className="glow-btn"
                onClick={() => { getJobDetails(); playSound(); }}
                disabled={isLoading || !jobId}
              >
                Scan
              </button>
              {jobDetails && (
                <div className="job-info">
                  <p>Commander: {jobDetails.employer.slice(0, 6)}...{jobDetails.employer.slice(-4)}</p>
                  <p>Mission: {jobDetails.title}</p>
                  <p>Brief Hash: {jobDetails.descriptionHash.slice(0, 10)}...</p>
                  <p>Crew Limit: {jobDetails.applicationLimit}</p>
                  <p>Crew Aboard: {jobDetails.applicationsCount}</p>
                  <p className={`status ${jobDetails.status.toLowerCase()}`}>
                    Status: {jobDetails.status}
                  </p>
                </div>
              )}
            </div>

            <div className="pod close-pod">
              <h2>End a Mission</h2>
              <p>Close a job as the commander.</p>
              <input
                placeholder="Job ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                type="number"
                min="0"
                disabled={isLoading}
              />
              <button
                className="glow-btn"
                onClick={() => { closeJob(); playSound(); }}
                disabled={isLoading || !jobId}
              >
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
      <footer>
        <p>HRChain v1.0 - Connected to {config.CHAIN_NAME}</p>
        <p className="footer-note">
          <a
            href={`https://explorer.nexus.xyz/address/${config.CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Contract
          </a>
        </p>
      </footer>
    </div>
  );
}

export default App;
