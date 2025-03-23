import React, { useState, useEffect, useCallback } from "react"; // Add useCallback
import { ethers, BrowserProvider, Contract, parseEther } from "ethers";
import HRChainABI from "./HRChain.json";
import clickSound from "./click.wav";
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const CONTRACT_ADDRESS = "0x53dD1b708b3B23cdD63eD6Fc882780dEBb647BA0";
const RPC_URL = "https://rpc.nexus.xyz/http";
const CHAIN_ID = "393";

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
  const clickAudio = new Audio(clickSound);

  const playSound = () => {
    clickAudio.play().catch((error) => console.log("Sound play error:", error));
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
    playSound();
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const contract = new Contract(CONTRACT_ADDRESS, HRChainABI, signer);

    setProvider(provider);
    setSigner(signer);
    setContract(contract);
    setAccount(address);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${parseInt(CHAIN_ID).toString(16)}` }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${parseInt(CHAIN_ID).toString(16)}`,
            chainName: "Nexus Devnet",
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: "NEX", symbol: "NEX", decimals: 18 },
          }],
        });
      }
    }
  };

  const fetchEmployerJobs = useCallback(async () => {
    if (!contract || !account) {
      console.warn("Cannot fetch jobs: contract or account not set");
      return;
    }
    try {
      const jobs = await contract.getEmployerJobs(account, 0, 10);
      console.log('Raw Job IDs:', jobs);
      if (jobs.length === 0) {
        console.log("No jobs found for employer:", account);
      }
      const jobDetailsPromises = jobs.map(async (jobId) => {
        const details = await contract.getJob(jobId);
        console.log(`Job ${jobId} Raw Status:`, details.status);
        const jobStatus = Number(details.status) === 0 ? "Open" : "Closed";
        console.log(`Job ${jobId} Interpreted Status:`, jobStatus);
        return {
          id: jobId.toString(),
          title: details.title,
          status: jobStatus,
        };
      });
      const jobDetails = await Promise.all(jobDetailsPromises);
      console.log('Processed Employer Jobs:', jobDetails);
      setEmployerJobs(jobDetails);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      toast.error("Failed to fetch jobs. Check the console for details.", {
        position: "top-right",
        autoClose: 5000,
        theme: theme,
      });
    }
  }, [contract, account, theme]);

  useEffect(() => {
    if (contract) {
      const onJobListed = (jobId, employer) => {
        console.log(`Job ${jobId} listed by ${employer}`);
        fetchEmployerJobs();
      };

      const onApplicationSubmitted = (jobId, applicant) => {
        toast.info(`🚀 New application for Job #${jobId} by ${applicant.slice(0, 6)}...`, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          theme: theme,
        });
      };

      const onJobClosed = (jobId) => {
        console.log(`Job ${jobId} closed`);
        fetchEmployerJobs();
        toast.info(`🌌 Job #${jobId} has been closed!`, {
          position: "top-right",
          autoClose: 5000,
          theme: theme,
        });
      };

      contract.on("JobListed", onJobListed);
      contract.on("ApplicationSubmitted", onApplicationSubmitted);
      contract.on("JobClosed", onJobClosed);

      fetchEmployerJobs();

      return () => {
        contract.off("JobListed", onJobListed);
        contract.off("ApplicationSubmitted", onApplicationSubmitted);
        contract.off("JobClosed", onJobClosed);
      };
    }
  }, [contract, theme, fetchEmployerJobs]);

  const listJob = async () => {
    if (!contract) return;
    try {
      const tx = await contract.listJob(title, description, parseInt(limit), {
        value: parseEther("0.01"),
      });
      await tx.wait();
      alert("Job listed—blast off!");
      setTitle("");
      setDescription("");
      setLimit("");
    } catch (error) {
      alert("Error: " + (error.reason || error.message));
    }
  };

  const applyToJob = async () => {
    if (!contract || !jobId) return;
    try {
      const tx = await contract.applyToJob(parseInt(jobId));
      await tx.wait();
      alert("Application sent into orbit!");
      setJobId("");
    } catch (error) {
      alert("Error: " + (error.reason || error.message));
    }
  };

  const getJobDetails = async () => {
    if (!contract || !jobId) return;
    try {
      const job = await contract.getJob(parseInt(jobId));
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
    } catch (error) {
      alert("Error: " + (error.reason || error.message));
      console.error("Error in getJobDetails:", error);
    }
  };

  const closeJob = async () => {
    if (!contract || !jobId) return;
    try {
      const tx = await contract.closeJob(parseInt(jobId));
      await tx.wait();
      alert("Job closed—mission complete!");
      setJobId("");
      fetchEmployerJobs();
    } catch (error) {
      alert("Error: " + (error.reason || error.message));
    }
  };

  const filteredJobs = employerJobs.filter((job) => {
    if (filter === "All") return true;
    if (filter === 'Open') return job.status.toLowerCase() === 'open';
    if (filter === 'Closed') return job.status.toLowerCase() === 'closed';
    return true;
  });
  console.log('Filter:', filter, 'Filtered Jobs:', filteredJobs);

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
        id="tsparticles"
        init={particlesInit}
        options={{
          background: { color: { value: "transparent" } },
          fpsLimit: 60,
          particles: {
            number: { value: 100, density: { enable: true, value_area: 800 } },
            color: { value: "#ffffff" },
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
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </header>

      {!account ? (
        <div className="connect-pod">
          <button className="glow-btn" onClick={() => { connectWallet(); playSound(); }}>
            Enter the Cosmos (Connect Wallet)
          </button>
        </div>
      ) : (
        <div className="dashboard">
          <p className="account">Pilot: {account}</p>

          <div className="galaxy-map">
            <h2>Galaxy Map: Your Missions</h2>
            <div className="filter">
              <label>Filter: </label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="All">All</option>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            {filteredJobs.length === 0 ? (
              <p>No missions found. Launch a new job to get started!</p>
            ) : (
              <div className="job-cards">
                {filteredJobs.map((job) => (
                  <div key={job.id} className="job-card">
                    <h3>Mission #{job.id}: {job.title}</h3>
                    <p>Status: {job.status}</p>
                    <button
                      className="glow-btn"
                      onClick={() => { setJobId(job.id); playSound(); }}
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
              />
              <input
                placeholder="Mission Brief"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <input
                placeholder="Crew Limit"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
              <button className="glow-btn" onClick={() => { listJob(); playSound(); }}>
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
              />
              <button className="glow-btn" onClick={() => { applyToJob(); playSound(); }}>
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
              />
              <button className="glow-btn" onClick={() => { getJobDetails(); playSound(); }}>
                Scan
              </button>
              {jobDetails && (
                <div className="job-info">
                  <p>Commander: {jobDetails.employer}</p>
                  <p>Mission: {jobDetails.title}</p>
                  <p>Brief Hash: {jobDetails.descriptionHash.slice(0, 10)}...</p>
                  <p>Crew Limit: {jobDetails.applicationLimit}</p>
                  <p>Crew Aboard: {jobDetails.applicationsCount}</p>
                  <p>Status: {jobDetails.status}</p>
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
              />
              <button className="glow-btn" onClick={() => { closeJob(); playSound(); }}>
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
